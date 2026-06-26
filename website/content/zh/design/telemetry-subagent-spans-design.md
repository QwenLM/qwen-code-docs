# Subagent 跟踪树设计（P3 第 3 阶段）

> Issue #3731 — 分层会话跟踪的第 3 阶段。新增 `qwen-code.subagent` span，使子代理调用获得独立的、可查询的跟踪结构，而不是静默交错在父级 `qwen-code.interaction` span 之下。
>
> 构建于第 1 阶段 (#4126)、第 1.5 阶段 (#4302) 和第 2 阶段 (#4321) 之上。

## 问题

目前，每次 `AgentTool.execute` 调用都在父级的 `qwen-code.interaction` span 下运行。存在三种病态情况：

1. **并发子代理交错。** `coreToolScheduler.ts:728` 将 `AGENT` 标记为并发安全 —— `Promise.all` 最多并行运行 10 个子代理。它们的 LLM 请求 / 工具 / 钩子 span 都附加到同一个共享的父交互 span 上，因此跟踪浏览器无法区分“此 LLM 请求属于子代理 A”还是“属于子代理 B”。
2. **子代理边界本身没有 span。** 有一个 `qwen-code.subagent_execution` LogRecord（从 `agent-headless.ts:268,329` 发出），通过 `LogToSpanProcessor` 桥接到同名的 span，但它是一个独立的标记，而不是一个将子代理的 LLM / 工具 / 钩子 span 嵌套在下面的父级 span。
3. **Fork / 后台子代理游离。** 即发即弃路径（`runInForkContext` / 后台）的存活时间超过父级 `AgentTool.execute`，并在多个后续用户轮次中发出 span。当这些 span 出现时，父工具 span 已经结束，因此 OTel 的 `context.active()` 无法起作用 —— 它们会附加到触发时恰好处于活动状态的任何交互，或者没有附加任何交互。

## 现有表面（无变更）

| 组件                                | 位置                                                                                                                                                                                                   | 为什么我们不修改它                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 生成位置（统一）                     | `packages/core/src/tools/agent/agent.ts:1147` `AgentTool.execute()`                                                                                                                                    | 单一入口点；是 3 种调用形式的理想钩子                                                      |
| 三种调用形式                        | 前台命名（`runFramed` 在 `:2154` — 已等待），fork（`void runInForkContext(runFramedFork)` 在 `:1991` — 即发即弃），后台（`void framedBgBody()` 在 `:1934` — 即发即弃）                                  | 生命周期不同 —— span 设计覆盖了所有三种形式                                               |
| 并发                                | `coreToolScheduler.runConcurrently`（`Promise.all`，上限 10） —— 由 `partitionToolCalls` 将 AGENT 标记为 `concurrent: true` 驱动                                                                         | 正是使得隔离成为必要的原因                                                                |
| `runInForkContext` ALS              | `packages/core/src/tools/agent/fork-subagent.ts:32` `forkExecutionStorage`                                                                                                                             | 仅用于递归 fork 防护 —— **不**传播 OTel 上下文                                           |
| 代理标识 ALS                        | `packages/core/src/agents/runtime/agent-context.ts:46` `runWithAgentContext(agentId, ...)`                                                                                                             | 已携带 `agentId`；我们扩展以包含 `depth`                                                 |
| `SubagentExecutionEvent` LogRecord  | `agent-headless.ts:268,329` → `loggers.ts:773` → 3 个下游（LogToSpanProcessor span 桥接 + QwenLogger RUM + `recordSubagentExecutionMetrics`）                                                           | LogRecord 保持不变；下游依赖它                                                            |

## 超出范围（延迟）

- **每个子代理的 token 使用量聚合**（`gen_ai.usage.*` 汇总子代理内所有 LLM span 的值）。属于第 4 阶段（LLM 请求分解）。
- **将 `qwen-code.subagent_execution` LogRecord 迁移到新的 span 上，作为 span 事件。** RUM 和指标与 LogRecord 紧密耦合；延迟到后续能同时协调所有 3 个消费者的工作。
- **自动成本汇总。** 相同原因 —— 需要先有 token 使用量。
- **移除 AGENT 工具的 `concurrent: true` 标记。** 并发是正确的；我们对其 instrument，而不是限制它。

## 参考资料（决策依据）

| 来源                                                                                                                     | 关键要点                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OTel 跟踪规范 —— span 之间的链接](https://opentelemetry.io/docs/specs/otel/overview/#links-between-spans)               | 原文："新的链接跟踪也可以表示一个长时间运行的异步数据处理操作，该操作由众多快速传入请求之一发起。" → fork/后台应该是链接根节点，而不是子节点。                                                                                                                                                      |
| [OTel GenAI 代理 Span](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)（状态：开发中）            | Span 名称 `invoke_agent {gen_ai.agent.name}`；必需属性 `gen_ai.operation.name`、`gen_ai.provider.name`；推荐：`gen_ai.agent.id`、`gen_ai.agent.name`、`gen_ai.conversation.id`。                                                                                                                  |
| LangSmith — 每条跟踪 25,000 次运行的限制                                                                                 | 长代理会话最终不可避免地需要拆分跟踪；倾向于混合 traceId 设计。                                                                                                                                                                                                                                    |
| [Sentry — 分布式跟踪](https://docs.sentry.io/concepts/key-terms/tracing/distributed-tracing/)                           | "子事务可能比包含其父 span 的事务存活更久" —— 支持子事务存活超过父事务。                                                                                                                                                                                                                           |
| claude-code (Anthropic)                                                                                                  | 仅在本地 Perfetto JSON 文件中具有子代理层次结构；OTel 导出是扁平的。没有可移植的代码。                                                                                                                                                                                                                             |
| opencode (sst/opencode)                                                                                                  | 使用 `@effect/opentelemetry` 自动插桩；显式使用 `context.with(trace.setSpan(active, span), fn)` 实现 `withRunSpan`。**验证了 `context.with` 隔离模式。** 他们对手动注册 `AsyncLocalStorageContextManager` 的警告不适用 —— qwen-code 的 `NodeSDK` 会自动注册它。 |

## 设计 —— 六项决策，各有理由

### D1 — Span 生命周期：调用方打开，被调用方在 `context.with(span, fn)` 内部运行

`agent.ts`（调用方）构造 span。执行体 —— 无论是已等待的（`runFramed`）还是即发即弃的（`runInForkContext` / 后台） —— 在 `runInSubagentSpanContext(span, fn)` 内部运行，后者调用 `otelContext.with(trace.setSpan(active, span), fn)`。

**在 `AgentTool.execute` 中具体在哪里打开 span？** 在**调用方特定设置之前立即**打开（`createAgentHeadless` / `createForkSubagent` 等）—— 这样设置时间（配置构建、ToolRegistry 重建、ContextOverride 接线）就包含在 `qwen-code.subagent` 的持续时间中。运维人员跟踪“这个子代理为什么慢？”时能看到完整情况。设置时间通常 << LLM 时间，因此没有噪声。

考虑的替代方案：在设置之后打开，排除设置时间。被拒绝，因为子代理的设置本身就是可归因于该子代理的工作 —— 隐藏它会在汇总所有子代理 span 时导致总持续时间计算错误。

**为什么不是仅在被调用方侧：** 等到 fork / 后台执行体实际运行时，调用方已经返回。OTel `context.active()` 会返回异步运行时携带的任何环境上下文 —— 对于父级结束后的 `void` 即发即弃场景，这是不可靠的。父 span 已经关闭；事后重新父化是错误的。

**为什么不是仅在调用方侧：** 前台工作正常，但 fork / 后台 span 必须在 `AgentTool.execute` 返回后继续发出子 span（LLM / 工具 / 钩子）。这些子 span 需要 `context.active()` 返回子代理 span —— 这仅在执行体显式运行在 `context.with(subagentSpan, body)` 内部时才会发生。

两端都需要。**这个设计就是桥梁** —— 调用方创建 span + 调用形式感知的 traceId 策略，然后通过 `runInSubagentSpanContext` 交出控制权。

### D2 — 混合 traceId：前台 = 子 span，fork/后台 = 新 traceId + 链接

| 调用形式   | 父级                       | TraceId                 | 原因                                                                                                                                                                        |
| ---------- | -------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foreground` | 调用方工具 span 的子 span  | 继承父 traceId          | OTel 默认；调用方在时间上完全包含被调用方                                                                                                                                    |
| `fork`     | 链接的根 span              | 新 traceId              | 调用方立即返回；fork 跨越多个后续交互运行。OTel 规范原文推荐为此使用链接。避免膨胀父跟踪的持续时间/大小。                                                                     |
| `background` | 链接的根 span              | 新 traceId              | 与 fork 推理相同。                                                                                                                                                          |

**链接载荷**：

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
  } /* 显式 context = 根，不继承活动状态 */,
);
```

通过会话 ID 实现跨跟踪查询：`gen_ai.conversation.id` 设置在每个子代理 span 上（无论是前台还是链接根节点），因此按 `session.id` 进行的 ARMS 查询会返回父交互跟踪和链接根子代理跟踪。链接本身会在父跟踪的 UI 中显示为“已生成：子代理 X（其他跟踪）”，因此导航可用。

**为什么不是始终为子：** 持续 4 小时的后台子代理会将父跟踪的挂钟持续时间膨胀到 4 小时；跟踪大小会超过多个后端的容量上限（LangSmith 的 25,000 次运行限制是最清晰的文档化边界）。用户实际等待的前台子代理没有这个问题，因为它们在时间上被包含在内。

**为什么不是始终为链接根：** 前台会破坏自然的跟踪树。一个运行同步 Explore 子代理的用户提示**应该**显示一棵树，而不是两个链接的跟踪。

### D3 — TTL：类型感知，子代理 fork/background = 4 小时，其他 = 30 分钟

`session-tracing.ts:124` 定义了 `SPAN_TTL_MS = 30 * 60 * 1000`。在 `:144-152` 的清理逻辑已经对 `tool.blocked_on_user` 特殊处理，打上 `decision: 'aborted' + source: 'system'` 标记。它在精神上已经是类型感知的。

**变更**：引入按类型划分的 TTL：

```ts
const SPAN_TTL_MS_DEFAULT = 30 * 60 * 1000; // 30 分钟
const SPAN_TTL_MS_LONG = 4 * 60 * 60 * 1000; // 4 小时

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

TTL 过期时，子代理 span 会被打上标记：

```ts
{
  'qwen-code.span.ttl_expired': true,
  'qwen-code.span.duration_ms': age,
  'qwen-code.subagent.status': 'aborted',
  'qwen-code.subagent.terminate_reason': 'ttl_swept',
}
```

**为什么不是固定 30 分钟：** 合法的长时间子代理（大型仓库分析、慢速构建、深度研究任务）会被错误地标记为 TTL 过期。4 小时覆盖了 99 百分位，同时又不会宽松到真正的挂起无法被检测到。

**为什么不是无 TTL：** 进程崩溃/OOM/kill -9 → span 永远留在 `activeSpans` Map 中。30 分钟的安全网可以防止这种情况；子代理 fork/background 只需要更宽的窗口，而不是移除。

**4 小时从哪里来：** 对于非平凡的代理任务（长时间深度研究/大型代码库分析）的实用上限。如果生产数据表明我们错了，可以通过常量配置。

### D4 — LogRecord 保留：保持发出，跳过 LogToSpanProcessor 桥接

`SubagentExecutionEvent` LogRecord 有 3 个下游消费者（通过仓库审计确认）：

| 消费者                                                                | 位置                                              | 操作                                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| OTel LogRecord → `LogToSpanProcessor` → 桥接 span `qwen-code.subagent_execution` | `loggers.ts:773` → `log-to-span-processor.ts:346` | **跳过此桥接**对于子代理事件 —— 新的 `qwen-code.subagent` span 将取代它                  |
| QwenLogger RUM 摄取（阿里云内部统计）                                  | `qwen-logger.ts:573-574`                          | 保留 —— RUM 不看不到 OTel span，只看到 LogRecords                                      |
| `recordSubagentExecutionMetrics` 计数器                               | `metrics.ts:829`                                  | 保留 —— 指标消费者与跟踪桥接独立                                                         |

**桥接跳过**（对 LogToSpanProcessor 的唯一更改）：

```ts
// log-to-span-processor.ts — 在 onEmit 内部，deriveSpanName 之后
const skipBridge = new Set<string>([
  EVENT_SUBAGENT_EXECUTION, // 由原生 qwen-code.subagent span 覆盖
]);
if (skipBridge.has(eventName)) return;
```

**对跟踪消费者的影响：** 按 span 名称 `qwen-code.subagent_execution` 过滤的仪表盘将开始返回零结果。它们应更新为 `qwen-code.subagent`。在发布说明中注明这一点。

**为什么不删除 LogRecord：** 它是 RUM 和指标的输入。删除它是一个涉及 3 个系统的重构；超出范围。

**为什么不保留两者：** 跟踪中每个子代理会显示两个 span（`qwen-code.subagent` + `qwen-code.subagent_execution`），携带重叠信息 —— 对读取跟踪的运维人员造成困惑，且重复的 span 体积。

### D5 — Span 名称 + 属性：混合规范合规，供应商前缀用于扩展

**Span 名称**：`qwen-code.subagent`（与第 1/2 阶段代码库规范一致：`qwen-code.interaction`、`qwen-code.tool`、`qwen-code.hook`……）。

OTel GenAI 规范说规范 span 名称是 `invoke_agent {gen_ai.agent.name}` —— 但**也**说“各个 GenAI 系统/框架可以指定不同的 span 名称格式。”我们使用自己的名称，并设置 `gen_ai.operation.name='invoke_agent'`，这样识别的工具仍然能识别该 span。读取我们跟踪树的运维人员将看到一致的 `qwen-code.*` 命名。

**Span 类型**：`INTERNAL`（进程内子代理调用，符合规范）。

**属性集合**：

| 类别                                                       | 属性                                             | 来源                                                                  | 备注                                                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **规范必需**                                               | `gen_ai.operation.name='invoke_agent'`           | 字面值                                                                | 规范必需                                                                                                                                                                        |
| **规范必需**                                               | `gen_ai.provider.name='qwen-code'`               | 字面值                                                                | 规范必需；对于进程内代理有歧义（规范是为 LLM 提供者编写的）。设置为 `'qwen-code'` 是最诚实的解释                                                                                  |
| **必需（双重发出）**                                       | `gen_ai.agent.id` + `qwen-code.subagent.id`      | `agentContext.agentId`                                                | 直到规范达到稳定状态前双重发出；随后移除供应商键                                                                                                                               |
| **必需（双重发出）**                                       | `gen_ai.agent.name` + `qwen-code.subagent.name`  | `agentConfig.subagentType`（例如 `Explore`、`code-reviewer`、`fork`） | 相同双重发出                                                                                                                                                                   |
| **规范推荐**                                               | `gen_ai.conversation.id`                         | `config.getSessionId()`                                               | 支持按会话跨跟踪查询；与现有的 `session.id` span 属性共存（根据 #4367 全局设置）—— 两者指向同一个 UUID，规范稳定后删除其中一个                                                 |
| **规范推荐**                                               | `gen_ai.request.model`                           | 模型覆盖（如果有）                                                    | 仅当子代理覆盖了父模型的模型时                                                                                                                                                  |
| **供应商**                                                 | `qwen-code.subagent.invocation_kind`             | `'foreground'` ❘ `'fork'` ❘ `'background'`                            | 驱动 TTL + traceId 策略                                                                                                                                                         |
| **供应商**                                                 | `qwen-code.subagent.is_built_in`                 | 布尔值                                                                | 仪表盘过滤                                                                                                                                                                     |
| **供应商**                                                 | `qwen-code.subagent.parent_agent_id`             | 父级 ALS `agentId`                                                    | 用于嵌套子代理 + 跨跟踪谱系                                                                                                                                                      |
| **供应商**                                                 | `qwen-code.subagent.depth`                       | 父级 depth + 1（顶层 = 0）                                            | 递归错误检测器                                                                                                                                                                   |
| **供应商**                                                 | `qwen-code.subagent.invoking_request_id`         | 来自 `agentContext`                                                   | 请求级关联                                                                                                                                                                     |
| **span 结束时符合规范**                                    | `error.type`（失败时）                            | 错误类                                                                | OTel 标准                                                                                                                                                                       |
| **span 结束时符合规范**                                    | `exception.message`（失败时）                     | `truncateSpanError(error.message)`                                    | OTel 标准；复用第 2 阶段的截断                                                                                                                                                      |
| **span 结束时供应商**                                      | `qwen-code.subagent.status`                      | `'completed'` ❘ `'failed'` ❘ `'cancelled'` ❘ `'aborted'`              | 比 OTel SpanStatus（OK / ERROR / UNSET）更精细                                                                                                                                   |
| **span 结束时供应商**                                      | `qwen-code.subagent.terminate_reason`            | 来自 `SubagentExecutionEvent.terminate_reason`                        | 例如 `task_complete`、`max_iterations`、`user_abort`、`ttl_swept`                                                                                                                |
| **span 结束时供应商**                                      | `qwen-code.subagent.result_summary_present`      | 布尔值                                                                | “子代理是否产生了输出” —— 有界                                                                                                                                                  |
| **选择性（敏感）** 由 `includeSensitiveSpanAttributes` 控制 | `gen_ai.input.messages`                          | 结构化聊天历史                                                        | 复用 #4097 的开关                                                                                                                                                                |
| **选择性（敏感）**                                         | `gen_ai.output.messages`                         | 模型响应                                                              | 相同开关                                                                                                                                                                       |
| **选择性（敏感）**                                         | `gen_ai.system_instructions`                     | 系统提示                                                              | 相同开关                                                                                                                                                                       |
| **选择性（敏感）**                                         | `gen_ai.tool.definitions`                        | 工具模式                                                              | 相同开关                                                                                                                                                                       |
**SpanStatus 映射**：

- `status === 'completed'` → `SpanStatus { code: OK }`
- `status === 'failed'` → `SpanStatus { code: ERROR, message: truncated(error.message) }`
- `status === 'cancelled'` 或 `'aborted'` → `SpanStatus { code: UNSET }`（与 Phase 2 约定一致）

**为什么在 `id` + `name` 上双发射**：规范处于 Development 阶段（比 Experimental 早一个阶段）。`OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` 可用于选择加入。规范中的属性名在进入 Stable 之前可能会重命名。双发射是 Phase 2 对 `call_id` → `tool.call_id` 使用的相同模式；当规范达到 Stable 时，移除厂商特定的键。

**为什么是 `qwen-code.subagent.*`（而不是 `qwen.subagent.*`）**：`constants.ts` 中每个已有的厂商前缀键都使用 `qwen-code.*`（`qwen-code.user_prompt`、`qwen-code.tool_call` 等）。内部一致性优先于 OTel 命名约定偏好，因为操作员通过前缀查询 ARMS。

**基数**：在 OTel 中，span 属性不是度量标签；以 UUID 为键的属性（`id`、`parent_agent_id`、`invoking_request_id`）在 span 层是安全的。以后不要将它们提升为度量标签。

**每个 span 约 10-15 个属性**（取决于调用类型、失败、嵌套）。顺序与 `qwen-code.tool` 相同。

### D6 — 直接添加 `AgentContext.depth` 字段

`AgentContext`（`agent-context.ts:32`）**未导出**——仅导出辅助方法（`getCurrentAgentId`、`runWithAgentContext`、`getRuntimeContentGenerator`、`runWithRuntimeContentGenerator`）。零个 TypeScript 层面的下游破坏。通过 `getCurrentAgentId()` 的 6 个已知读取者仅读取 `agentId`；添加 `depth?: number` 对它们不可见。

```ts
interface AgentContext {
  agentId: string;
  subagentName: string;
  invokingRequestId: string;
  invocationKind: 'spawn' | 'resume';
  isBuiltIn: boolean;
  depth?: number; // 新增 — 在读取者中默认为 0
}
```

`runWithAgentContext` 已经使用 `{ ...current, agentId }` 展开，因此 `depth` 在现有调用点处保持不变。**更新 `runWithAgentContext` 以在内部自动递增 depth**——调用者无需知道 depth：

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

顶层子智能体：没有父 ALS → `depth: 0`。嵌套：父 depth+1。

一个新的小型访问器 `getCurrentAgentDepth(): number` 返回 `agentContextStorage.getStore()?.depth ?? 0`——由 `startSubagentSpan` 使用以填充 `qwen-code.subagent.depth`。

**为什么不另设一个仅用于遥测的 ALS**：会复制我们已经维护的相同上下文形状。不好。重用现有的。

## 辅助 API (`session-tracing.ts`)

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
  invokerSpanContext?: SpanContext; // fork / background 需要（Link 来源）
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
    // 当前活动 span 的子 span（调用者的工具 span）
    return tracer.startSpan(SPAN_SUBAGENT, {
      kind: SpanKind.INTERNAL,
      attributes,
    });
  }

  // fork / background：链接的根 span
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
    root: true, // 强制新的 traceId；忽略作为父级的活动上下文
  });
}
```

## 生命周期连线

### 前台命名（常见路径）

```ts
// agent.ts:~2154
// 拉取父 ALS 帧以在 span 上设置 parentAgentId。新的子 span 的
// depth 在 runWithAgentContext 内部自动计算（D6）——我们
// 一旦进入子 ALS 帧，就通过 getCurrentAgentDepth() 读取它。
// 两步：
const parentAgentId = getCurrentAgentId();  // 在进入子帧之前

// ... 现有的 runFramed 调用进入 runWithAgentContext(hookOpts.agentId, ...) ...

// 在 runFramed 内部，我们可以读取子 span 的 depth：
//   const depth = getCurrentAgentDepth();
//
// 实际放置：将 depth 作为闭包变量传递，在 runWithAgentContext 生效后设置 — 或者从调用者侧计算为
// `(外部的 getCurrentAgentDepth()) + 1`（更简单）。
const depth = getCurrentAgentDepth();  // 外部帧；子 span 将是此值 + 1
// （在 startSubagentSpan 参数中设置 qwen-code.subagent.depth = depth）

const span = startSubagentSpan({
  agentId, subagentName, invocationKind: 'foreground',
  isBuiltIn, parentAgentId, depth, invokingRequestId, sessionId,
  modelOverride,
  // invokerSpanContext 省略 — 前台通过 context.with 自然继承
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

### Fork（即发即忘）

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
// span 在父会话的后续交互中持续存在。
```

### 后台

与 fork 形状相同，使用 `invocationKind: 'background'` 和 `bgEventEmitter` 而不是 `eventEmitter`。TTL 为 4 小时（与 fork 相同——来自 D3 的类型规则）。

## 并发隔离——标题性保证

来自一个用户提示的三个并发子智能体调用（模型发出 3 个 AGENT tool_use 块 → `coreToolScheduler.runConcurrently` 并行运行 3 个 `executeSingleToolCall`；每个在 Phase 2 中打开自己的 `qwen-code.tool` span）：

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
         └─ ...                               [traceId=T1, may emit hours later]
```

`context.with(span, runX)` 为 A、B、C 每个并发运行。`AsyncLocalStorageContextManager`（已由 NodeSDK 在 `sdk.ts:273` 自动注册）按纤程作用域限定；无交叉干扰。每个子智能体的子 LLM / 工具 / 钩子 span 在其自己的异步链中通过 `context.active()` 看到 `span`。

Fork（C）是一个独立的 trace——即使父会话的后续交互中发出，其子 span 继承 `traceId=T1`。通过 `session.id` 查询 ARMS 会返回 T0 和 T1；从 T1 的根到 C 的调用 `qwen-code.tool` span 的 Link 提供显式导航。

## 需要更改的文件

| 文件                                                          | 更改                                                                                                                                                                                         | 估计 LOC |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `packages/core/src/telemetry/constants.ts`                  | 添加 `SPAN_SUBAGENT`、`SPAN_TTL_MS_LONG`、属性键常量                                                                                                                                        | +8      |
| `packages/core/src/telemetry/session-tracing.ts`            | 添加 `startSubagentSpan`（前台/链接根分支）、`endSubagentSpan`、`runInSubagentSpanContext`、类型；将 `SpanType` 联合扩展为包含 `'subagent'`；将 TTL 扫描扩展为包含 `ttlFor(ctx)`             | +120    |
| `packages/core/src/telemetry/log-to-span-processor.ts`      | 跳表以绕过桥接 `qwen-code.subagent_execution`                                                                                                                                               | +6      |
| `packages/core/src/telemetry/index.ts`                      | 重新导出新辅助方法 + 类型                                                                                                                                                                   | +6      |
| `packages/core/src/agents/runtime/agent-context.ts`         | 在 `AgentContext` 中添加 `depth?: number` + `getCurrentAgentDepth()` 访问器                                                                                                                  | +12     |
| `packages/core/src/tools/agent/agent.ts`                    | 将 3 个执行路径（前台/fork/后台）包装在 `runInSubagentSpanContext` 中，带有 try/catch/finally                                                                                               | +60     |
| `packages/core/src/telemetry/session-tracing.test.ts`       | 新的 `describe('subagent spans')`: start/end, child vs linked-root, context propagation, depth, TTL per type, idempotent end, NOOP under SDK-uninitialized                                  | +120    |
| `packages/core/src/telemetry/log-to-span-processor.test.ts` | 断言跳表短路 subagent_execution 桥接                                                                                                                                                         | +20     |
| `packages/core/src/tools/agent/agent.test.ts`               | 端到端：3 个并发子智能体各自获得隔离子树；fork 的 span 通过 Link 继承新 traceId；后台生命周期                                                                                              | +80     |

总计：9 个文件，约 430 LOC。比典型的 Phase 2 提交大，但可以接受——TTL 更改触及一个单独的文件，LogToSpanProcessor 跳表是一个单独的文件，测试文件加倍。拆分会导致遥测表面不完整。

如果审查因大小而反对：拆分为 2 个 PR ——（A）遥测辅助方法 + 测试，（B）`agent.ts` 连线 + 端到端测试。先合并的辅助方法不会改变运行时行为。

## 测试策略

| 测试                                                                         | 它证明了什么                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `startSubagentSpan foreground parents to active OTel span`                   | 子 span 路径                                                 |
| `startSubagentSpan fork creates new traceId + Link to invoker`               | 链接根路径                                                |
| `runInSubagentSpanContext propagates span through awaits / Promise.all`      | 隔离原语                                             |
| `3 concurrent subagent spans don't share children`                           | 标题性并发保证                                  |
| `nested subagent records depth + parentAgentId`                              | 嵌套元数据                                                |
| `endSubagentSpan status mapping (completed / failed / cancelled / aborted)`  | 状态分类                                                 |
| `endSubagentSpan dual-emits gen_ai.agent.id + qwen-code.subagent.id`         | 规范合规的双发射                                       |
| `fork lifecycle: span survives AgentTool.execute return`                     | 即发即忘正确性                                     |
| `TTL: subagent fork stays past 30min, gets stamped + ended at 4h`            | 类型感知 TTL                                                  |
| `TTL: foreground subagent at 30min gets default sweep`                       | TTL 不会过度扩展                                         |
| `LogToSpanProcessor skips qwen-code.subagent_execution but still RUM-emits`  | 桥接跳转有效                                               |
| `runConcurrently of 3 agent tool calls produces 3 distinct subagent spans`   | 调度器级别的端到端                                   |
| `failed subagent sets exception.message + error.type + SpanStatus=ERROR`     | OTel 标准错误路径                                        |
| `opt-in attrs gated on includeSensitiveSpanAttributes`                       | 正确重用 #4097 的阀门                                       |
| `startSubagentSpan returns NOOP_SPAN when SDK is uninitialized`              | 匹配 Phase 1/2 的 NOOP 纪律；下游调用保持安全             |
| `fork span Link.context matches invoker tool span's spanContext`             | 跨 trace 导航端到端工作                         |
| `runWithAgentContext auto-increments depth: parent=0, child=1, grandchild=2` | 深度簿记在无需调用者协作的情况下正确 |

## 边界情况

| 情况                                                                                                                    | 处理                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 子智能体在工具内部的子智能体（depth > 1）                                                                        | `depth` 属性跟踪；建议在 depth ≥ 5 时软 `debugLogger.warn`（无限递归检测器）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 子智能体在父工具的 `awaiting_approval` 期间产生                                                             | 子智能体 span 是 AGENT 工具 span 的子 span；AGENT 工具的 `tool.blocked_on_user` 是兄弟，不是父级——两者都是 AGENT 工具 span 的子 span。树保持正确                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `signal.aborted` 在子智能体中间                                                                                           | `runInSubagentSpanContext` 的回调抛出或解析；`finally` 设置 `status='aborted'`，SpanStatus UNSET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 父会话结束时 fork 仍然存活                                                                               | 4 小时 TTL 触发；哨兵属性 `qwen-code.span.ttl_expired:true`、`qwen-code.subagent.terminate_reason='ttl_swept'`、`status='aborted'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `endSubagentSpan` 被调用两次                                                                                          | 幂等——检查 `activeSpans` 映射；第二次调用无操作（匹配 Phase 2 模式）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 子智能体的 LLM 调用使用与父级不同的模型                                                                  | 在子智能体 span 上设置 `gen_ai.request.model`；LLM-request 子 span 也记录模型——无冲突                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 姐妹子智能体前置抛出逃离 `attemptExecutionOfScheduledCalls`                                                | 落入 Phase 2 最近修复的 `handleConfirmationResponse` 捕获中，该捕获在 try 外部——不归因于已确认工具的 span。子智能体 span 通过自身的 try/finally 正确关闭                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 从同一个父级并发 fork + 前台                                                                            | 前台继承 T0 traceId，fork 获得 T1。两者都有正确的上下文传播，独立。父工具 span 在其同步工作返回时结束；fork span（单独的 trace）继续存在                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Fork span 在调用者同步流中开始，但主体稍后运行                                                                | `startSubagentSpan` 在 `void runInForkContext(...)` _之前_ 调用，因此 span（及其到调用者的 Link）在调用者的 spanContext 仍然可读时被捕获。因此 span 持续时间包括主体实际开始之前的任何微任务队列调度延迟——通常是亚毫秒级；如果生产环境中显示出非平凡的间隙，可以添加一个单独的 `qwen-code.subagent.scheduling_delay_ms` 属性（开放问题）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| SDK 未初始化（遥测禁用）                                                                                | `startSubagentSpan` 提前返回 NOOP_SPAN（匹配所有其他 Phase 1/2 辅助方法）。`runInSubagentSpanContext(NOOP_SPAN, fn)` 仍然正常调用 `fn`。`endSubagentSpan(NOOP_SPAN, …)` 是无操作                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Fork 的日志桥接 span（`tool_call`、`api_request` 等）使用会话派生的 traceId，而 fork 的原生 span 使用 T1 | 预先存在的行为——日志桥接 span 始终使用 `deriveTraceId(sessionId)`，原生 span 使用 OTel 上下文。这种差异在一个 trace 内不可见，但意味着通过 T1 的基于 traceId 的 ARMS 查找不会包括 fork 的日志桥接子 span。此 PR 超出范围；作为开放问题 #5 提出                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 前台与后台 `SubagentStart` 钩子 span 父级不同                                                       | 前台在 `runSubagentWithHooks` 内部触发 `fireSubagentStartEvent` → 已经在 `runInSubagentSpanContext` 内部，因此钩子 span 父级在 `qwen-code.subagent` 下。后台在 `runWithSubagentSpan` 包装 _之前_ 触发它（因此子智能体 span 还不存在），因此其钩子 span 父级在 AGENT `qwen-code.tool` 下。查询“子智能体 span 下的钩子 span”的操作员应预期后台 `SubagentStart` 从该视图中缺失。将后台钩子触发移到 `framedBgBody` 内部在机械上很简单（`contextState` 变异无论如何都到达 `bgSubagent.execute`），但它改变了用户可见的语义：今天，钩子在 `AgentTool.execute` 返回“后台代理已启动”消息之前同步触发，因此钩子所做的任何同步设置工作都发生在用户阻塞的回合中；移动它会使钩子在启动消息返回后分离触发。推迟，等待关于首选语义的深思熟虑的决定 |
## 回滚

该变更在 OTel 层面是添加性的——现有不按子代理相关 span 名称进行过滤的仪表盘能继续正常工作。按父 span 分组的 trace 消费者会在 `qwen-code.tool` 和 `qwen-code.llm_request` 之间看到新的 `qwen-code.subagent` 节点；在发布说明中记录。

影响行为的变化是 LogToSpanProcessor 的跳过——之前消费 `qwen-code.subagent_execution` span 的仪表盘将返回零。缓解措施：保持 LogRecord 完整（RUM + 指标仍能看到它）；仅移除 span 桥接。现有的基于日志的查询不受影响。

回滚路径：撤销单个 PR。新的 span 辅助函数仅从 `agent.ts` 中调用；移除接线 + LogToSpanProcessor 的跳过即可 1:1 恢复之前的行为。

## 采样影响

| 调用方式                                         | 采样决策来源                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `foreground`（子 span，相同 traceId）             | 通过基于父级的采样器继承父 trace 的采样或不采样决策                          |
| `fork` / `background`（链接的根 span，新 traceId） | 在根创建时进行独立采样决策                                                    |

对于 qwen-code 当前的默认设置（根据 `tracer.ts:shouldForceSampled()` 逻辑——parentbased 加 always_on，否则 always_on），每个 span 都被采样，因此这种差异不会造成影响。对于使用概率采样器（例如 `traceidratio=0.1`）的部署，这意味着：

- 用户提示可能被采样（T0 完全捕获），但其 fork（T1）可能被丢弃，反之亦然。
- 运维人员阅读父 T0 时会看到"Link: subagent C (T1)"——如果 T1 未被采样，点击后可能返回 404。

缓解措施：为运维人员记录文档。如果完全捕获子代理很重要，可以通过未来的配置旋钮强制对 fork/background 进行采样。此处不讨论。

## 敏感属性（#4097 集成）

复用现有的 `includeSensitiveSpanAttributes` 开关。当为 true 时，在生命周期钩子中数据可用的地方设置到子代理 span：

| 规格属性                          | 来源                                             | 设置时机                                                                                   |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `gen_ai.system_instructions`     | 来自 `agentConfig` / 父上下文的渲染后系统提示     | `startSubagentSpan`（如果在 span 打开之前可用）或通过 `setAttributes` 在 body 早期设置      |
| `gen_ai.tool.definitions`        | 子代理可用的工具声明                               | 同上                                                                                       |
| `gen_ai.input.messages`          | 传递给子代理的初始输入（prompt + extraHistory）     | 在 body 开始时设置                                                                          |
| `gen_ai.output.messages`         | 子代理返回的最终响应消息                           | 在 `endSubagentSpan` 元数据中设置                                                           |

这些内容都已经受到开关控制；#4097 的模式是在 body 内部调用 `addSubagentSensitiveAttributes(span, opts)` 辅助函数。实现细节——设计只标注了集成点。

## 顺序

- 独立于 #4367（资源属性——审查中）。无合并顺序约束，但子代理 span 上的 `gen_ai.conversation.id` 得益于 #4367 将 `session.id` 移出资源。**建议先合并 #4367**，以便 `getSessionId()` 的真相来源确定下来。
- 独立于阶段 4（LLM 请求分解 / TTFT）。阶段 4 附加到 `qwen-code.llm_request` span 上，无论它们位于子代理还是交互之下。建议阶段 3 在阶段 4 之前进行，以便阶段 4 的每次尝试指标可以按子代理聚合。

## 开放问题

1. **`gen_ai.provider.name`**：规范要求它，但描述是针对 LLM provider 而非 agent 框架写的。设置为 `'qwen-code'` 是最佳解释；如果未来规范修订增加了 `agent.provider.name` 变体，我们应该切换。
2. **Span 名称 `qwen-code.subagent` 与规范 `invoke_agent {name}`**：选择内部一致性。如果 GenAI 感知的工具广泛采用且 `invoke_agent ${name}` 成为自动发现的关键，我们可以切换——span 名称是 OTel 中最易重命名的东西。
3. **深度 ≥ 5 时发出软警告**：随意数字。可以做成配置旋钮。推迟到生产数据显示有需要时再做。
4. **`SubagentExecutionEvent.result` 的完整 LLM 输出很大**：目前它使 LogRecord 体积膨胀。迁移计划（LogRecord → span events）已推迟，但一旦 token 使用聚合在阶段 4 落地，就值得做。
5. **fork 内部的日志桥接 span 最终位于会话派生的 traceId 而非 fork 的 T1**：参见边缘情况。修复方法是更广泛的"交互 span 不继承会话根上下文"问题，该问题在 sessionId-vs-traceId 线程中提出——这是一个单独的设计，影响所有原生 span，不仅仅是子代理。不在此讨论。