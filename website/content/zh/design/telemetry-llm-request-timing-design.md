# LLM 请求耗时分解设计（P3 第四阶段）

> Issue #3731 — 层级化 session 追踪的第四阶段。在 `qwen-code.llm_request` span 上新增首 token 到达时间（TTFT）、请求建立耗时、采样耗时以及每次重试的遥测数据，让运维人员无需猜测即可回答"这个 LLM 调用为什么慢？"
>
> 基于第一阶段（#4126）、第 1.5 阶段（#4302）、第二阶段（#4321）构建。与第三阶段（#4410，审核中）相互独立——建议先合并第三阶段，使第四阶段的每次尝试字段能够在子 agent 子树下正确聚合。

## 问题

`qwen-code.llm_request` span 目前只记录 `model`、`prompt_id`、`input_tokens`、`output_tokens`、`success`、`error`、`duration_ms`。运维人员查看单条 trace 时无法得知：

1. **`duration_ms` 中有多少是模型计算时间，有多少是网络建立时间。** 一个 12 秒的 `duration_ms` 可能是 11 秒重试加 1 秒快速生成，也可能是 100ms 建立加 12 秒缓慢流式输出——trace 无从区分。
2. **用户何时看到第一个 token。** TTFT（首 token 到达时间）是聊天 UI 的标准延迟 SLO。我们既无法计算，也没有采集。
3. **重试期间发生了什么。** `retryWithBackoff`（`utils/retry.ts:285`）只调用了 `debugLogger.warn`——没有 OTel 事件，没有 span 属性。4 个经过它的 LLM 调用点（`client.ts:1540`、`baseLlmClient.ts:193,282`、`geminiChat.ts:1039`）在 trace 或指标中完全没有重试可见性。`ContentRetryEvent` 仅用于 `geminiChat.ts:806,830` 内部的内容恢复重试，不覆盖更常见的速率限制 / 5xx 重试。
4. **`api.request.breakdown` 是死代码。** 该指标在 `metrics.ts:242-251` 定义，包含 4 个 `ApiRequestPhase` 值，从 `index.ts:117` 导出，在 `metrics.test.ts:646-675` 中有测试——但 `recordApiRequestBreakdown()` 在生产代码中没有任何调用方。指标基础设施已就位，数据链路从未接通。

这些缺失使 `qwen-code.llm_request` 成为 trace 树中信息量最少的 span。工具 span（#4126/#4321）和子 agent span（#4410）都暴露了生命周期阶段；唯独 LLM span 将整个请求压缩成一个不透明的耗时值。

## 现有接口（不做改动）

| 组件 | 位置 | 不改动的原因 |
| ---- | ---- | ------------ |
| LLM 请求 span 生命周期 | `session-tracing.ts` `startLLMRequestSpan` / `endLLMRequestSpan` | 第一阶段（#4126）已建立这些辅助函数。我们扩展 metadata 接口，不重构结构 |
| 向 provider generator 传播活跃 span | `loggingContentGenerator.ts:213,287` | 第一阶段（#4126）将 `withSpan('api.*')` 替换为原生辅助函数；活跃上下文已传达到流包装器 |
| `ContentRetryEvent` schema 及其消费者 | `types.ts:626`、`qwen-logger.ts:947`、`loggers.ts:717` | 现有事件保持原有结构和下游消费；我们为 `retryWithBackoff` 路径新增一个同级事件类 |
| `LogToSpanProcessor` 日志桥 span | `log-to-span-processor.ts` | ContentRetryEvent 现有的日志桥继续嵌套在活跃 LLM span 下。第四阶段不做改动 |
| `ApiRequestPhase` 枚举 | `metrics.ts:330-334` | 公开接口（4 个值）。我们在生产代码中填充其中 3 个；枚举保持不变以向后兼容 |
| 各 provider chunk 标准化 → `GenerateContentResponse` | `loggingContentGenerator.ts:286-393` | 每个 provider 在 LoggingContentGenerator 看到流之前已将数据标准化为 Google 的 `GenerateContentResponse` 格式。TTFT 检测在此标准化格式上集中运行，无需针对各 provider 编写代码 |
| `retryWithBackoff` 通用重试 | `utils/retry.ts:140` | 同时被 LLM 调用方和非 LLM 调用方（`channels/weixin/src/api.ts`）使用。我们通过可选的 `onRetry` 回调扩展，而非强耦合到 LLM 遥测 |
| 非流式 `generateContent` | `loggingContentGenerator.ts:212` | TTFT 对非流式无意义，新字段保持 `undefined`。span 生命周期及现有属性不变 |

## 范围外（延期）

- **SDK 级别重试**（openai SDK `maxRetries=3`、google-genai SDK 内部重试）。这些完全发生在第三方 SDK 内部；要观察它们需要禁用 SDK 重试并在 `retryWithBackoff` 中重新实现。单独决策，不在第四阶段范围内。
- **逐 token 流式指标**（token 间延迟、每个 chunk 大小）。对推理引擎性能调试有用，但不属于第四阶段所针对的用户感知延迟问题。
- **推理/thinking 块的独立 TTFT。** "首 token"包含思考内容（见 D1）。未来可拆分为 `ttft_to_reasoning_ms` 与 `ttft_to_answer_ms`，但需等有明确需求后再做。
- **采样阶段作为独立子 span。** 可通过 `duration_ms - ttft_ms - request_setup_ms` 计算得出；子 span 对纯 OTel 后端没有额外价值（claude-code 仅将其用于 Perfetto）。改为 span 属性存储——见 D6。
- **持久重试模式（`QWEN_CODE_UNATTENDED_RETRY`）的事件级别速率限制。** 单个 LLM 请求在持久重试下可能产生 50+ 条 `ContentRetryEvent` / `ApiRetryEvent` 记录。限制发送量作为后续跟进——第四阶段发送所有事件；若生产环境量级难以承受，在后续 PR 中添加每 span 发送上限及"+N 次尝试（已截断）"汇总事件。
- **`TOKEN_PROCESSING` 分解阶段。** 枚举值已存在，但 qwen-code 没有真正值得测量的流后本地处理（通常 <10ms）。生产代码中跳过；枚举值保留以备将来使用或供我们不控制的调用方使用。
- **将 `ContentRetryEvent` 迁移为 LLM span 上的 span event。** 与第三阶段 `subagent_execution` LogRecord 的理由相同：现有消费者（qwen-logger RUM、未来指标）与 LogRecord 紧耦合。日志桥 span 的覆盖已经足够。

## 参考资料（决策依据）

| 来源 | 关键结论 |
| ---- | -------- |
| claude-code（Anthropic）`claude.ts:1762, 1789, 1982, 2882` | TTFT 在 `message_start` SSE 事件时捕获为 `Date.now() - start`；每次重试时 `start` 重置。`requestSetupMs = start - startIncludingRetries`。`attemptStartTimes` 数组按次尝试保留。验证了该方案的可行性；其 TTFT 语义为"首个流事件"（我们采用"首个内容"——见 D1） |
| claude-code `perfettoTracing.ts:549-671` | 将 Request Setup → Attempt N（重试）→ First Token → Sampling 渲染为嵌套的 B/E 事件对。展示了可视化分解方式；由于 qwen-code 没有 Perfetto，我们通过 OTel 属性实现相同的分解 |
| claude-code `sessionTracing.ts:447` | OTel span 上只有 `ttft_ms`（不含 `requestSetupMs`、`samplingMs`、逐次尝试时序）。我们有意在 span 上记录更多——claude-code 有 Perfetto 可视化，我们没有 |
| opencode（sst/opencode）`session/llm.ts`、`route/client.ts` | 未做 TTFT 测量。单个 `LLM.run` Effect span 覆盖所有内容。验证了该缺口存在于多个竞品工具中；不作为参考方案 |
| [OTel GenAI 语义约定](https://opentelemetry.io/docs/specs/semconv/gen-ai/)（状态：开发中 / 实验性） | `gen_ai.usage.input_tokens`（稳定）、`gen_ai.usage.output_tokens`（稳定）、`gen_ai.usage.cached_tokens`（实验性）、`gen_ai.request.model`（稳定）、`gen_ai.server.time_to_first_token`（实验性，双精度浮点秒）。双重发送模式沿用 #4410 先例 |
| [OTel Trace 规范——Span Events](https://opentelemetry.io/docs/specs/otel/trace/api/#add-events) | "Events SHOULD NOT be used to record information that's better captured as Span Attributes." 确认每次尝试的信息应作为 LLM span 属性 + 日志桥 span，而非父 span 上的 Span Event |
| 第三阶段设计文档（`telemetry-subagent-spans-design.md`） | 建立了双重发送模式（`qwen-code.subagent.id` + `gen_ai.agent.id`）和"私有名称为权威"规则。第四阶段对 TTFT 和 token 字段遵循相同约定 |

## 设计——七项决策及其依据

### D1 — TTFT 语义："首个包含用户可见内容的 chunk"

TTFT 测量的是从**成功尝试**的请求发出到**首个包含用户可见输出的流 chunk** 的挂钟时间。满足以下条件的 chunk 视为"用户可见"——`candidates[0].content.parts` 中任意标准化 `Part` 为：

- `text`，且字符串非空
- `functionCall`（工具调用）
- `inlineData`（图片、二进制）
- `executableCode`
- `thought` / 推理内容（provider 暴露的任意形式——Gemini 的 `thought`、Anthropic 的 `<thinking>` 块、OpenAI o1 的推理 chunk）

仅包含 `role` 元数据或仅包含 `usageMetadata`（最终用量汇总 chunk）的 chunk 不触发 TTFT。

**为何不用"任意类型的首个流事件"（claude-code 的选择）**：claude-code 在 `message_start` 时测量 TTFT，这是 Anthropic 特有的元数据事件，比实际内容早触发 50–300ms。其内部 `headlessProfiler.ts` 已将 `time_to_first_response_ms` 单独记录用于"用户看到内容"这一语义，承认了两者的区别。qwen-code 跨越多个 provider（Anthropic、OpenAI、Gemini、Qwen）——采用元数据事件语义意味着 Anthropic 的 TTFT 与 OpenAI 的 TTFT（OpenAI 没有类似的纯元数据首事件）本质上不可比。用户可见内容语义在 4 个 provider 间统一，且字面上符合"首 token 到达时间"的含义。

**为何包含 `thought` / 推理内容**：从运维视角看，推理 chunk 仍属于"模型产生了输出"。排除它们会低估推理密集型模型（o1、Qwen 思考模式）的 TTFT。未来可拆分为 `ttft_to_reasoning_ms` 与 `ttft_to_answer_ms`；不在第四阶段范围内。

**为何包含纯工具调用 chunk**：Agent 工具决策 LLM 调用（一个 `tool_use`，无文本）在 qwen-code 工作流中很常见。排除它们意味着此类请求的 TTFT 未定义。`functionCall` Part 是有意义的输出。

**跨产品对比说明**：设计文档明确指出 `qwen-code.ttft_ms ≈ claude-code.time_to_first_response_ms ≠ claude-code.ttft_ms`。跨产品对比时应对齐用户可见内容语义。

### D2 — TTFT 测量位置：`LoggingContentGenerator.generateContentStream` 的方法局部变量

首 chunk 检测在 `loggingContentGenerator.ts:393`（`async function* processStreamGenerator`）的现有流包装器内运行。每次调用的变量（`start`、`ttftMs`）存在于方法的闭包中；**绝不作为实例字段**。

**为何绝不使用实例字段**：`LoggingContentGenerator` 在每个 `ContentGenerator` 实例化**一次**（`contentGenerator.ts:377`），并在所有并发 `generateContentStream` 调用之间共享——子 agent 扇出、预热查询、`geminiChat` 的旁路查询都会使用它。实例字段在并发调用间会相互覆盖，导致每两个交错请求中有一个的 TTFT 数据失真。

**为何不用 AsyncLocalStorage**：ALS 可以工作，但为一段不需要逃逸出方法的状态增加了上下文管理层。方法局部变量更简单，零开销，零泄漏风险。

```ts
// loggingContentGenerator.ts — 在 generateContentStream 内部
const attemptStart = Date.now(); // 每次调用的局部变量
const requestEntryTime = Date.now(); // 同样是每次调用的局部变量——见 D3
let ttftMs: number | undefined;
const attemptStartTimes: number[] = [attemptStart];
let retryTotalDelayMs = 0;
let finalAttempt = 1;
// 流包装器检查每个 chunk；首个匹配 hasUserVisibleContent 的 chunk：
//   ttftMs = Date.now() - attemptStart;
```

`hasUserVisibleContent(chunk)` 是一个小的独立辅助函数，与包装器放在一起，对外导出以供测试：

```ts
function hasUserVisibleContent(chunk: GenerateContentResponse): boolean {
  const parts = chunk.candidates?.[0]?.content?.parts;
  if (!parts?.length) return false;
  return parts.some(
    (p) =>
      (typeof p.text === 'string' && p.text.length > 0) ||
      p.functionCall !== undefined ||
      p.inlineData !== undefined ||
      p.executableCode !== undefined ||
      // @ts-expect-error — `thought` 在部分 SDK 版本中未定义，但 provider 会发送
      p.thought !== undefined,
  );
}
```

### D3 — `request_setup_ms` 计算：入口时间 vs 成功尝试开始时间

`request_setup_ms` 测量从 `generateContentStream`/`generateContent` 进入到**成功尝试开始**的挂钟时间——包含所有失败重试、退避等待以及重试前的准备工作。

```ts
request_setup_ms = attemptStart_of_successful_attempt - requestEntryTime;
```

当 `attempt === 1` 且无重试时，`request_setup_ms` 较小（仅 SDK 建立时间）。发生重试时，它捕获全部重试预算开销。

**将其写入 OTel span（与 claude-code 的做法不同，claude-code 仅写入 Perfetto）**：三个层面的理由：

1. **没有 Perfetto** — qwen-code 没有带外可视化层。OTel 属性是唯一的渠道。
2. **单 trace 调试** — 运维人员看到 `duration_ms=12000, request_setup_ms=11500, ttft_ms=200, sampling_ms=300` → 立即诊断出"重试消耗了 11.5 秒，模型本身很快"。从其他字段推算 `request_setup_ms` 还需要同时暴露 `sampling_ms`，而我们本来就会暴露（D6）。
3. **可忽略的成本** — 1 个 INT64 属性。与现有 `input_tokens`、`output_tokens` 属性同量级。后端摄入成本无关紧要。

### D4 — 重试遥测：`retryWithBackoff` 的 `onRetry` 回调选项 + `ApiRetryEvent` + AsyncLocalStorage 传播

> **第四阶段 b 更新（实现过程中的新发现）**：本节最初按照 claude-code 的"单个 LLM span 拥有重试循环"模式编写。实现第四阶段 b 时发现，qwen-code 的 4 个 `retryWithBackoff` 调用点（`client.ts:2109`、`baseLlmClient.ts:235,333`、`geminiChat.ts:2035`——合并时的行号）均将 `apiCall = () => contentGenerator.generateContent(...)` 包裹其中。重试层位于 LoggingContentGenerator **之上**。每次重试都会全新调用 `apiCall()` → 全新的 `qwen-code.llm_request` span。不存在跨次尝试共享的单一 span。在 `LoggingContentGenerator` 内部的累积器无法工作。
>
> **解决方案**：通过 `AsyncLocalStorage`（`packages/core/src/utils/retryContext.ts` 中的 `retryContext`）传播重试状态。`retryWithBackoff` 将每个 `await fn()` 包裹在 `retryContext.run({ attempt, requestSetupMs, retryTotalDelayMs }, fn)` 中。`LoggingContentGenerator` 在同步前置代码中读取 ALS，并将值转发给 `endLLMRequestSpan`。这实际上带来了比原计划**更丰富**的可观测性——每次尝试的 span 都有自己的 `duration_ms` / `ttft_ms` / 错误详情，并通过每次尝试的 `attempt` / `requestSetupMs` / `retryTotalDelayMs` 属性知晓自己在重试预算中的位置。
>
> ALS 方案与代码库中的现有模式一致（`promptIdContext`、`subagentNameContext`、`agent-context`）——新增接口最小，语义清晰。方案审查过程经过 3 轮 review，发现 22 个问题，均在合并前解决。

`retryWithBackoff` 目前调用 `logRetryAttempt`（`retry.ts:343`），只向 `debugLogger.warn` 写入。我们通过可选回调扩展 `RetryOptions` 接口：

```ts
// utils/retry.ts
interface RetryOptions<T> {
  // ... 现有字段 ...
  /**
   * 可选。每次失败尝试后、退避等待前调用一次。
   * 接收尝试序号（从 1 开始）、错误和下次尝试前的延迟。
   * 在 LLM 调用点使用此回调发送遥测事件；
   * 非 LLM 调用方（如 channels/weixin）不设置，
   * 以避免在 LLM 特定遥测通道中产生噪音。
   */
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number; // 从 1 开始，与 debugLogger 输出一致
  error: unknown;
  errorStatus?: number;
  delayMs: number; // 下次尝试前的退避延迟
}
```

4 个 LLM 调用点（`client.ts:1540`、`baseLlmClient.ts:193,282`、`geminiChat.ts:1039`）注册回调以发送新的 `ApiRetryEvent`：

```ts
// types.ts — 新事件类，与 ContentRetryEvent 同级
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number; // 从 1 开始
  error_type: string;
  error_message: string; // 截断至 256 字符
  status_code?: number;
  retry_delay_ms: number;
  // ... duration_ms 设为 retry_delay_ms，使 LogToSpanProcessor 渲染
  // 有意义宽度的日志桥 span
  duration_ms: number;
}
```

**为何新建事件类而不扩展 `ContentRetryEvent`**：

- `ContentRetryEvent` 有 2 个下游消费者（qwen-logger、log-record export）。修改其 payload 有破坏它们的风险。
- "content retry" 在语义上指内容恢复重试（无效流、schema 修复）——将其扩展以覆盖速率限制重试会使 schema 混乱。
- 新事件是增量添加；不给消费者带来意外。

**为何不将回调内嵌于 `retry.ts`**：`retry.ts` 也被 `channels/weixin/src/api.ts`（microsoft 消息 API 重试）调用。将 LLM 遥测硬耦合到 retry.ts 内部会对非 LLM 重试也发送 `ApiRetryEvent`。`onRetry` 回调由调用方按需注册——LLM 调用方注册，weixin 调用方不注册。

**与 ContentRetryEvent 的共存**：ContentRetryEvent 保持原状，用于 `geminiChat.ts:806,830` 内部的内容恢复重试。ApiRetryEvent 覆盖 `retryWithBackoff` 产生的速率限制 / 5xx 重试。两个事件来自不同层，永不重复。两种事件的现有日志桥行为均通过 `LogToSpanProcessor` 保留——两者都自动嵌套在活跃 LLM span 下（第一阶段的连线确保 LLM span 在重试期间保持活跃）。

**持久重试模式（`QWEN_CODE_UNATTENDED_RETRY`）**：单个 429 循环请求可能产生 50+ 个事件。第四阶段不限制发送量——若生产环境量级难以承受，在后续 PR 中添加每 span 上限及汇总事件。父 LLM span 上聚合的 `attempt` 和 `retry_total_delay_ms`（D5）无论是否有事件上限均保持准确。

### D5 — 父 LLM span 聚合：仅使用标量属性（不使用 map 类型属性）

OTel span 属性为标量（`string | number | boolean | array of these`）。map 类型属性（如 `retry_count_by_status: {429:2, 503:1}`）需要 JSON 序列化，查询时也很不方便。直接跳过。

| 属性 | 类型 | 语义 |
| ---- | ---- | ---- |
| `attempt` | int | 来自 `retryContext.attempt` 的从 1 开始的单调计数器（本次尝试的序号）。始终有值（无重试上下文时默认为 1） |
| `retry_total_delay_ms` | int | 本次尝试开始前的累计退避等待时间。直接调用时未定义；第 1 次尝试为 0；后续重试尝试 > 0 |
| `ttft_ms` | int | 按 D1 定义的 TTFT；非流式或在首 chunk 前中止的请求为 undefined |
| `request_setup_ms` | int | 按 D3 |
| `sampling_ms` | int | 按 D6 |
| `output_tokens_per_second` | double | 派生值；`output_tokens / (sampling_ms / 1000)`；`sampling_ms === 0` 时为 undefined |

每次尝试的状态码分布（如"3 次尝试中 2 次是 429"）可从 `ApiRetryEvent` 记录的日志桥 span 查询。无需在父 span 上以扁平属性形式重复。

**为何在 span 上记录 `sampling_ms` 和 `output_tokens_per_second`**：可推导，但在后端查询中跨多个 span 求和时计算繁琐。与 `request_setup_ms`（D3）成本效益相同。

### D6 — 激活 `recordApiRequestBreakdown()` 用于 4 个阶段中的 3 个

在 `endLLMRequestSpan`（或调用它的包装器）中，计算完 TTFT/setup/sampling 后发送：

```ts
recordApiRequestBreakdown(config, model, [
  { phase: ApiRequestPhase.REQUEST_PREPARATION, durationMs: requestSetupMs },
  { phase: ApiRequestPhase.NETWORK_LATENCY, durationMs: ttftMs }, // ttftMs = 网络 + 首 token 生成
  { phase: ApiRequestPhase.RESPONSE_PROCESSING, durationMs: samplingMs },
]);
```

**为何跳过 `TOKEN_PROCESSING`**：qwen-code 的流 chunk 处理是内联的（合并发生在 `loggingContentGenerator.ts:644` 的包装器中）；流后收尾阶段 <10ms，在架构上也无明显独立性。填入无意义的值会污染直方图。枚举值保留未使用是安全的——`apiRequestBreakdownHistogram.record(value, {model, phase})` 只是一个以 `phase` 为标签的直方图；缺失的标签在查询中仅仅是不存在。

**为何不重新定义 `NETWORK_LATENCY`**：该枚举名略有误导（它是网络加首 token 生成，而非纯网络延迟），但：

- 该枚举是 `metrics.ts:330-334` 的一部分，从 `index.ts:117` 导出并有测试。
- 后端 dashboard 可能已引用这些阶段名称。
- 重命名或新增阶段对极微小的准确性提升而言是破坏性变更。

在设计文档中说明语义；枚举保持不变。

**为何在 span 路径上而非并行执行**：使 `recordApiRequestBreakdown` 与 span 属性写入在同一位置——单一的带守卫发送点（见 D7 幂等性），单一的顺序不变量。

### D7 — `endLLMRequestSpan` 幂等性：指标记录在现有双重结束守卫内执行

第 1.5 阶段（#4302）确立了 `endLLMRequestSpan` 可能被调用两次（中止路径 + 错误路径冲突）。`session-tracing.ts:~470` 处的现有守卫（`if (!activeSpans.has(...)) return;`）防止 `span.end()` 被重复调用。第四阶段的指标记录（D6）**必须在同一守卫块内**、在 `span.end()` 之前执行：

```ts
// session-tracing.ts — endLLMRequestSpan
const llmCtx = activeSpans.get(spanRef);
if (!llmCtx) return;            // 已结束——双重结束守卫
activeSpans.delete(spanRef);    // 声明结束权

// ... 计算耗时，设置属性 ...
if (metadata) {
  recordApiRequestBreakdown(config, llmCtx.attributes.model, [...]);   // 新增——在守卫内
  recordTokenUsageMetrics(...); // 现有
}

span.end();
```

这保证每个 LLM 请求的指标**恰好记录一次**，与 span 生命周期一致。

**为何不在 `loggingContentGenerator` 中记录**：它看不到中止路径。在 span 生命周期层记录可确保每个打开了 span 的 LLM 请求都恰好产生一条分解样本，无论成功/失败/中止。

### D8 — GenAI 语义约定双重发送（私有名称为权威）

每个与 OTel GenAI semconv 属性对应的第四阶段属性在 span 上写入两次：

| qwen-code 私有（权威） | GenAI semconv（兼容层） | 单位转换 | 规范状态 |
| ---------------------- | ----------------------- | -------- | -------- |
| `ttft_ms`（ms，int） | `gen_ai.server.time_to_first_token`（秒，double） | `ttftMs / 1000` | 实验性 |
| `input_tokens`（int） | `gen_ai.usage.input_tokens`（int） | 相同 | 稳定 |
| `output_tokens`（int） | `gen_ai.usage.output_tokens`（int） | 相同 | 稳定 |
| `cached_input_tokens`（int，如有） | `gen_ai.usage.cached_tokens`（int） | 相同 | 实验性 |
| `qwen-code.model`（string） | `gen_ai.request.model`（string） | 相同 | 稳定 |

**LLM span 上的现有 token 属性名**（在第四阶段前由 `endLLMRequestSpan` 设置）：qwen-code 已使用裸名 `input_tokens` 和 `output_tokens`。第四阶段新增 `gen_ai.usage.*` 同级属性以匹配 #4410 的模式。裸名保留；**不重命名**。

无 GenAI semconv 等价的字段——`request_setup_ms`、`sampling_ms`、`retry_total_delay_ms`、`attempt`、`output_tokens_per_second`——仅在 qwen-code 命名空间下发送。

**为何"私有权威，semconv 作为兼容层"**：

- 内部 dashboard、SLO、debugLogger 输出、qwen-logger RUM、ARMS 查询——均引用 `ttft_ms` 等。将这些视为权威可避免大规模迁移。
- 实验性 GenAI semconv 在达到稳定之前可能重命名 `gen_ai.server.time_to_first_token`。届时只需更新 semconv 发送；qwen-code 名称不变。
- 未来支持规范的后端（Datadog AI 视图、Honeycomb AI、ARMS GenAI dashboard）无需我们介入即可自动识别 `gen_ai.*` 属性。

**为何双重发送需要单位转换**（ms ↔ 秒）：GenAI semconv 为延迟选择了双精度浮点秒；qwen-code 选择了整数毫秒（与 span 上已有的 `duration_ms` 保持一致）。两种表示都有价值；转换成本极低。

## 辅助 API（对 `session-tracing.ts` 的增量补充）

```ts
// session-tracing.ts — LLMRequestMetadata 接口扩展（增量）
export interface LLMRequestMetadata {
  // ... 现有字段：inputTokens, outputTokens, cachedInputTokens, success, error, ...

  /** 从成功尝试开始到首个用户可见内容 chunk 的时间（ms）。非流式或在首 chunk 前中止的请求为 undefined。 */
  ttftMs?: number;

  /** 从 generateContent 进入到成功尝试开始的时间（ms）。包含所有失败重试 + 退避。 */
  requestSetupMs?: number;

  /** 最终尝试序号（从 1 开始）。1 = 无重试。 */
  attempt?: number;

  /** 成功尝试前所有退避延迟之和（ms）。 */
  retryTotalDelayMs?: number;
}

// 无新增导出辅助函数——第四阶段复用 startLLMRequestSpan / endLLMRequestSpan，传入扩展后的 metadata。
```

```ts
// types.ts — 新事件类
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY = EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number;
  error_type: string;
  error_message: string;
  status_code?: number;
  retry_delay_ms: number;
  duration_ms: number;  // = retry_delay_ms，驱动 LogToSpanProcessor 日志桥 span 的宽度

  constructor(opts: { model: string; promptId?: string; attemptNumber: number; error: unknown; statusCode?: number; retryDelayMs: number }) { ... }
}

// constants.ts
export const EVENT_API_RETRY = 'qwen-code.api_retry';

// loggers.ts
export function logApiRetry(config: Config, event: ApiRetryEvent): void { ... }
```

```ts
// utils/retry.ts — RetryOptions 扩展
interface RetryOptions<T> {
  // ... 现有 ...
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number;
  error: unknown;
  errorStatus?: number;
  delayMs: number;
}

// 在 retryWithBackoff 中，现有调用 logRetryAttempt 的位置：
options.onRetry?.({ attempt, error, errorStatus, delayMs: actualDelay });
logRetryAttempt(attempt, error, errorStatus); // 现有 debugLogger 调用保持不变
```

## 生命周期连线

### 流式路径（常见情况）

```ts
// loggingContentGenerator.ts:283 — generateContentStream
async generateContentStream(req, userPromptId): Promise<AsyncGenerator<GenerateContentResponse>> {
  const requestEntryTime = Date.now();
  let attemptStart = requestEntryTime;
  const attemptStartTimes: number[] = [attemptStart];
  let retryTotalDelayMs = 0;
  let finalAttempt = 1;

  // 使用现有的 startLLMRequestSpan（第一阶段）
  // 将 onRetry 回调传递给所使用的重试层：
  const onRetry: RetryAttemptInfo & { invoke: ... } = (info) => {
    finalAttempt = info.attempt + 1;        // 即将开始第 N+1 次尝试
    retryTotalDelayMs += info.delayMs;
    attemptStart = Date.now() + info.delayMs; // 近似值；实际重置在下次尝试开始时
    attemptStartTimes.push(attemptStart);
    // 发送 ApiRetryEvent
    logApiRetry(this.config, new ApiRetryEvent({
      model: req.model,
      promptId: userPromptId,
      attemptNumber: info.attempt,
      error: info.error,
      statusCode: info.errorStatus,
      retryDelayMs: info.delayMs,
    }));
  };

  // 流包装器检测首个用户可见 chunk：
  return this.processStreamGenerator(stream, ..., {
    onFirstUserVisibleChunk: (now) => {
      ttftMs = now - attemptStart;
    },
  });
}
```

在 span 结束时（已在第一阶段的 `endLLMRequestSpan` 流程中），将新字段包含在 `LLMRequestMetadata` 中：

```ts
endLLMRequestSpan(llmSpan, {
  success: true,
  inputTokens,
  outputTokens,
  cachedInputTokens,
  ttftMs,
  requestSetupMs: attemptStart - requestEntryTime,
  attempt: finalAttempt,
  retryTotalDelayMs,
});
```

### 非流式路径

`generateContent`（`loggingContentGenerator.ts:212`）不产生流式 chunk。TTFT 为 `undefined`；`request_setup_ms` 仍有意义（捕获重试开销）。分解指标记录 2 个阶段（REQUEST_PREPARATION + RESPONSE_PROCESSING，其中 `RESPONSE_PROCESSING = duration_ms - request_setup_ms`），而非 3 个。

### 重试层集成（4 个调用点）

4 个 LLM `retryWithBackoff` 调用点各自添加 `onRetry`：

```ts
// client.ts:1540（baseLlmClient.ts:193, 282, geminiChat.ts:1039 处类似）
const result = await retryWithBackoff(apiCall, {
  ...existingOptions,
  onRetry: (info) => {
    logApiRetry(
      this.config,
      new ApiRetryEvent({
        model,
        promptId: userPromptId,
        attemptNumber: info.attempt,
        error: info.error,
        statusCode: info.errorStatus,
        retryDelayMs: info.delayMs,
      }),
    );
    // 同时反馈到 LoggingContentGenerator 的局部重试累积器
    // （在作用域内时——对于不经过 LoggingContentGenerator 的调用方，
    // LLM span 仍通过 metadata 路径获得 `attempt` 和 `retry_total_delay_ms`，
    // 因为 endLLMRequestSpan 在 LLM 层调用）
  },
});
```

非 LLM 调用方（`channels/weixin/src/api.ts`）**不注册 `onRetry`**——其重试不发送 `ApiRetryEvent`，与当前行为保持一致。

## 并发安全——核心保证

`LoggingContentGenerator` 实例是共享的（每个 `ContentGenerator` 一个，`contentGenerator.ts:377`）。3 个并发 `generateContentStream` 调用（如 3 个子 agent 通过 `coreToolScheduler.runConcurrently` 扇出）各自执行独立的 `generateContentStream` 闭包：

```
call_A: attemptStart_A, ttftMs_A, ...（闭包）
call_B: attemptStart_B, ttftMs_B, ...（闭包）
call_C: attemptStart_C, ttftMs_C, ...（闭包）
```

每次调用的局部变量永不交叉。流 chunk 根据各自调用的局部 `attemptStart` 检测。Span 属性在各自调用的 `endLLMRequestSpan` 时设置。

`AsyncLocalStorageContextManager`（由 NodeSDK 在 `sdk.ts:273` 注册）已确保活跃 OTel 上下文——以及传递给 `startLLMRequestSpan` 的父 span——在每个 fiber 中是正确的。

## 需要修改的文件

| 文件 | 修改内容 | 预估行数 |
| ---- | -------- | -------- |
| `packages/core/src/telemetry/constants.ts` | 添加 `EVENT_API_RETRY` 常量 | +2 |
| `packages/core/src/telemetry/types.ts` | 添加 `ApiRetryEvent` 类及联合类型成员 | +40 |
| `packages/core/src/telemetry/loggers.ts` | 添加 `logApiRetry()` 函数 | +20 |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts` | 添加 `logApiRetryEvent()` 以保持 RUM 下游一致性 | +20 |
| `packages/core/src/telemetry/session-tracing.ts` | 扩展 `LLMRequestMetadata`（ttftMs, requestSetupMs, attempt, retryTotalDelayMs）；扩展 `endLLMRequestSpan` 以设置新属性 + 分解指标 + 双重发送 gen_ai.\* | +60 |
| `packages/core/src/telemetry/metrics.ts` | 在 `endLLMRequestSpan` 内连线 `recordApiRequestBreakdown` 调用点（现有记录器无需修改） | 0 |
| `packages/core/src/utils/retry.ts` | 向 RetryOptions 添加 `onRetry?: (info: RetryAttemptInfo) => void`；导出 `RetryAttemptInfo`；在现有 logRetryAttempt 位置调用回调 | +25 |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts` | TTFT 捕获：方法局部累积器 + `hasUserVisibleContent` 辅助函数 + 流包装器中的首 chunk 检测；将新 metadata 传给 `endLLMRequestSpan` | +80 |
| `packages/core/src/core/client.ts` | 在 `retryWithBackoff` 调用点（`client.ts:1540`）连线 `onRetry` 回调 | +15 |
| `packages/core/src/core/baseLlmClient.ts` | 在 2 个 `retryWithBackoff` 调用点连线 `onRetry` 回调 | +25 |
| `packages/core/src/core/geminiChat.ts` | 在 `retryWithBackoff` 调用点（`geminiChat.ts:1039`）连线 `onRetry` 回调 | +15 |
| `packages/core/src/telemetry/session-tracing.test.ts` | `endLLMRequestSpan` 设置 ttft_ms / request_setup_ms / attempt / retry_total_delay_ms / sampling_ms / output_tokens_per_second + gen_ai 双重发送 + 分解指标（每个阶段）+ 幂等结束 | +120 |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.test.ts` | `hasUserVisibleContent`（text / functionCall / inlineData / executableCode / thought / 纯 role / 纯 usage）；并发调用不交叉污染；在首 chunk 前中止时 TTFT 为 undefined；非流式时 TTFT 为 undefined | +100 |
| `packages/core/src/utils/retry.test.ts` | `onRetry` 每次失败尝试都被调用，包含正确的 `attempt`、`delayMs`、`error`、`errorStatus`；缺少 `onRetry` 时静默（不发送遥测） | +50 |

总计：14 个文件，约 610 行。比第二阶段（#4321）大，但与第三阶段（#4410）相当，且因集成广度（4 个重试调用点 + 遥测管道 + 流包装器）而有充分理由。

若 review 对大小提出异议，可拆分为**第四阶段 a + 4b + 4c**：

- **4a**（约 200 行）：TTFT 捕获 + 扩展 `LLMRequestMetadata` + 双重发送。独立可用（从第一天起就有 TTFT 可见性）。
- **4b**（约 250 行）：`onRetry` 回调 + `ApiRetryEvent` + 4 个调用点连线。**独立来看是一个 bug 修复**，解决 `retryWithBackoff` 遥测缺失问题。
- **4c**（约 160 行）：激活 `recordApiRequestBreakdown` + 父 span 聚合属性（`attempt`、`retry_total_delay_ms`、`sampling_ms`、`output_tokens_per_second`）。依赖 4a + 4b。

## 测试策略

| 测试 | 验证内容 |
| ---- | -------- |
| `hasUserVisibleContent` 对 text/functionCall/inlineData/executableCode/thought 返回 true | D1 各 part 类型语义 |
| `hasUserVisibleContent` 对纯 role 和纯 usage chunk 返回 false | D1 反例 |
| 流式：TTFT 从尝试开始到首个用户可见 chunk 测量 | 端到端 TTFT 检测 |
| 流式：流在任何用户可见 chunk 前中止时 TTFT 为 undefined | 边界情况 |
| 流式：TTFT 从最终尝试开始计算（非首次尝试） | D3——重试时 TTFT 重置 |
| 非流式：TTFT 保持 undefined | S3 决策 |
| 并发 `generateContentStream` 调用不交叉污染 TTFT | D2——方法局部保证 |
| `endLLMRequestSpan` 设置所有第四阶段属性（ttft_ms, request_setup_ms, sampling_ms, attempt, retry_total_delay_ms, output_tokens_per_second） | 属性存在性 |
| `endLLMRequestSpan` 双重发送 gen_ai.server.time_to_first_token + gen_ai.usage.\* + gen_ai.request.model | D8 双重发送 |
| `endLLMRequestSpan` 流式记录 3 个阶段的分解指标，非流式记录 2 个 | D6 |
| `endLLMRequestSpan` 被调用两次：指标恰好记录一次，属性不重复设置 | D7 幂等性 |
| 带 `onRetry` 的 `retryWithBackoff`：每次失败尝试调用回调，参数正确 | D4 回调约定 |
| 不带 `onRetry` 的 `retryWithBackoff`：不发送遥测（非 LLM 调用方静默） | P2——channels/weixin 范围保护 |
| `client.ts` / `baseLlmClient.ts` / `geminiChat.ts` 重试调用点在重试时发送 `ApiRetryEvent` | D4 在 4 个调用点的集成 |
| `ApiRetryEvent` LogRecord 通过 LogToSpanProcessor 日志桥成为活跃 LLM span 下的子 span | trace 树正确性 |
| LLM span 的 `attempt` 字段在重试下正确反映最终尝试序号 | D5 聚合 |
| LLM span 的 `retry_total_delay_ms` 正确累加 onRetry 延迟 | D5 聚合 |
| `sampling_ms === 0`（无流式）时 `output_tokens_per_second` 为 undefined | 避免除零 |

## 边界情况

| 情况 | 处理方式 |
| ---- | -------- |
| 流在任何 chunk 到达前中止 | `ttftMs = undefined`，`sampling_ms = undefined`，`output_tokens_per_second = undefined`。`attempt`、`request_setup_ms` 仍设置。`success = false` |
| 流在首 chunk 后中止 | `ttftMs` 已设置；`sampling_ms` = `duration_ms - ttftMs - request_setup_ms`；反映部分响应时间。`success = false` |
| 第 1 次尝试成功（无重试） | `attempt = 1`，`retry_total_delay_ms = 0`，不发送 `ApiRetryEvent`，分解指标记录 `request_setup_ms` 接近 0 |
| 持久重试模式 50+ 次尝试 | 发送 50+ 条 `ApiRetryEvent`（截断上限延期）；LLM span `attempt = 51`，`retry_total_delay_ms = 所有延迟之和`。运维人员在 span 上看到聚合视图；逐次尝试详情在日志桥 span 中 |
| 非 LLM `retryWithBackoff` 调用方（channels/weixin） | 未注册 `onRetry`；只有现有 `debugLogger.warn` 触发。无 `ApiRetryEvent`；无分解指标（非 LLM 调用点） |
| `endLLMRequestSpan` 被调用两次（中止 + 错误竞争） | 第 1.5 阶段在 `activeSpans.delete()` 处的守卫在第二次调用时提前返回；`recordApiRequestBreakdown` 在守卫内，恰好记录一次 |
| Anthropic `message_start` chunk 在内容前到达 | `hasUserVisibleContent` 对其返回 false（没有包含 text/functionCall 等的 parts）；TTFT 等到后续 `content_block_delta` chunk 才触发 |
| OpenAI 首 chunk 只有 `role`，`delta.content` 为空 | `hasUserVisibleContent` 返回 false；TTFT 等到首个有非空 delta 的 chunk 才触发 |
| 纯工具调用响应（无文本） | 首个包含 `functionCall` Part 的 chunk 触发 TTFT；`output_tokens_per_second` 按工具调用 token 数计算 |
| 并发子 agent（3 个请求在途） | 每个调用的闭包有自己的 `attemptStart`、`ttftMs`、`attemptStartTimes`。每个调用在 `endLLMRequestSpan` 时设置各自的 span metadata。不交叉（D2） |
| openai-sdk 内部重试（`maxRetries=3`） | qwen-code 遥测不可见——完全在 SDK 内部发生，在 retryWithBackoff 看到请求之前。`attempt` 仅反映 retryWithBackoff 的尝试次数。范围外（见范围外章节） |
| `gen_ai.server.time_to_first_token` 规范在达到稳定前重命名 | 单文件更新：`session-tracing.ts:endLLMRequestSpan`。qwen-code 原生 `ttft_ms` 保持权威——无下游影响 |
| 子 agent 的 LLM 请求 | 父级为子 agent span（第三阶段）。第四阶段字段正确嵌套。按 `qwen-code.subagent.id` 分组的聚合可得出每个子 agent 的 LLM 性能——设计文档中标注为未来工作，易于跟进 |
| 推理模型含长思考块 | 首个 `thought` Part 触发 TTFT；`sampling_ms` 包含思考阶段和回答阶段。拆分为独立指标延期 |

## 回滚

该变更在 OTel 和指标层面是增量添加——所有新属性均为可选，所有新事件均为新类。不过滤新字段的现有 dashboard 保持正常工作。

行为相关的变更：

- 新 `ApiRetryEvent` LogRecord 开始流动 → 日志量随重试率增加（通常 <1% 的请求会重试）。如需可在 SDK 层对 LogRecord 采样。
- 新分解指标 `qwen-code.api.request.breakdown` 开始产生时序数据 → Prometheus 基数略微增加（`{model, phase}`——有界）。
- `output_tokens_per_second` 派生属性可能在过滤"所有属性"的 dashboard 上显示异常——需文档说明。

回滚路径：还原单个 PR（或 4a/4b/4c 各自独立还原）。所有新字段使用防御性默认值（undefined / 0），不改变 span 结构。

## 执行顺序

- **在第三阶段（#4410，审核中）之后**：不是硬依赖。第四阶段属性无论 `qwen-code.llm_request` span 位于 `qwen-code.subagent`（第三阶段）下还是 `qwen-code.interaction`（第一阶段）下，均可正常附加。建议先合并第三阶段，使子 agent 子树下的逐次尝试聚合自然运作。
- **与 #4384 无关**（`traceparent` + `X-Qwen-Code-Session-Id` 出站传播）。它们触及 HTTP 层；第四阶段触及流/重试/指标层。
- **与 `clearDetailedSpanState` 聊天压缩跟进工作无关**（#4097 后续）。不同接口。

## 开放问题

1. **`onRetry` 回调触发时机**：在退避等待**之前**触发（当前方案）还是**之后**（即将开始下次尝试时）？等待前更简单——回调立即获得所有信息；等待后需要单独捕获刚完成的延迟。建议等待前触发；在回调约定中文档说明。
2. **LLM span 上的逐次尝试时序**：是否添加 `attempt_durations_ms: number[]` 数组属性？OTel 支持原始类型数组属性。对"N 次尝试中哪次慢"的诊断有用。延期——等生产数据显示需求后再加；日志桥 span 已携带等价信息。
3. **持久重试模式发送上限**：在 `attempt > N` 的哪个阈值开始采样？`N = 5` 然后 1/10 采样？`N = 10` 然后仅汇总？延期——等有生产流量数据后再定。
4. **`TOKEN_PROCESSING` 阶段**：枚举值保持休眠还是关联某个实际值（如合并时间）？延期——等有真实用例后再决定。
5. **子 agent 级别 LLM 汇总**：第四阶段合并后的简单跟进——按子 agent 子树汇总 `ttft_ms`/`output_tokens`/`input_tokens`。不在第四阶段范围内，但数据流已就位。
