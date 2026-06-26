# LLM 请求时序分解设计（P3 阶段 4）

> Issue #3731 — 分层会话追踪的阶段 4。为 `qwen-code.llm_request` span 添加首 token 时间、请求建立耗时、采样耗时以及每次重试的遥测数据，使运维人员无需猜测就能回答“这个 LLM 调用为什么慢？”。
>
> 建立在阶段 1 (#4126)、阶段 1.5 (#4302)、阶段 2 (#4321) 的基础上。与阶段 3 (#4410，审核中) 独立——建议先合入阶段 3，以便阶段 4 的每次尝试字段能干净地在子代理子树下聚合。

## 问题

目前 `qwen-code.llm_request` span 仅携带 `model`、`prompt_id`、`input_tokens`、`output_tokens`、`success`、`error`、`duration_ms`。运维人员在查看单个 trace 时，无法判断：

1. **`duration_ms` 中有多少是模型思考时间，多少是网络建立时间。** 12 秒的 `duration_ms` 可能是 11 秒重试后跟 1 秒快速生成，也可能是 100 毫秒建立后跟 12 秒慢速流式输出——trace 无法说明。
2. **用户何时看到第一个 token。** TTFT（首 token 时间）是聊天 UI 的标准延迟 SLO。我们无法计算，也未捕获。
3. **重试期间发生了什么。** `retryWithBackoff` (`utils/retry.ts:285`) 仅调用 `debugLogger.warn`——没有 OTel 事件，没有 span 属性。经过它的 4 个 LLM 调用点 (`client.ts:1540`、`baseLlmClient.ts:193,282`、`geminiChat.ts:1039`) 在 trace 或指标中完全没有重试可见性。`ContentRetryEvent` 虽然存在于 `geminiChat.ts:806,830` 的恢复内容重试中，但并未覆盖更常见的限流/5xx 重试。
4. **`api.request.breakdown` 是死代码。** 该指标在 `metrics.ts:242-251` 定义，包含 4 个 `ApiRequestPhase` 值，从 `index.ts:117` 导出，在 `metrics.test.ts:646-675` 中测试——但 `recordApiRequestBreakdown()` 在生产代码中没有任何调用者。指标基础设施已付出代价，但数据流从未连接。

这些缺陷使 `qwen-code.llm_request` 成为 trace 树中最不具信息性的 span。工具 span (#4126/#4321) 和子代理 span (#4410) 都暴露了生命周期阶段；而 LLM span 则将整个请求压缩为一个不透明的持续时间。

## 现有表面（不作更改）

| 组件 | 位置 | 为何不动它 |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM 请求 span 生命周期 | `session-tracing.ts` `startLLMRequestSpan` / `endLLMRequestSpan` | 阶段 1 (#4126) 已建立这些辅助函数。我们扩展元数据接口，不重构结构 |
| 活动 span 传播到提供者生成器 | `loggingContentGenerator.ts:213,287` | 阶段 1 (#4126) 已用原生辅助函数替换了 `withSpan('api.*')`；活动上下文已经能到达流包装器 |
| `ContentRetryEvent` 模式 + 消费者 | `types.ts:626`、`qwen-logger.ts:947`、`loggers.ts:717` | 现有事件保持其形状和下游；我们为 `retryWithBackoff` 路径添加一个同级事件类 |
| `LogToSpanProcessor` 日志桥接 span | `log-to-span-processor.ts` | ContentRetryEvent 的现有桥接继续嵌套在活动 LLM span 下。阶段 4 不改变此行为 |
| `ApiRequestPhase` 枚举 | `metrics.ts:330-334` | 公开表面（4 个值）。我们填充生产代码中的 3 个值；保留枚举不变以向后兼容 |
| 按提供者的块归一化 → `GenerateContentResponse` | `loggingContentGenerator.ts:286-393` | 每个提供者已归一化为 Google 的 `GenerateContentResponse` 形状，之后 LoggingContentGenerator 才看到流。TTFT 检测在此归一化形状上集中运行；无需按提供者编写代码 |
| `retryWithBackoff` 通用重试 | `utils/retry.ts:140` | 被 LLM 调用者和非 LLM 调用者 (`channels/weixin/src/api.ts`) 共同使用。我们扩展一个可选加入的 `onRetry` 回调，而不是硬耦合到 LLM 遥测 |
| 非流式 `generateContent` | `loggingContentGenerator.ts:212` | TTFT 对非流式无意义；新字段保持 `undefined`。span 生命周期和现有属性不变 |

## 不纳入范围（延后处理）

- **SDK 级别的重试**（openai SDK `maxRetries=3`、google-genai SDK 内部重试）。这些完全发生在第三方 SDK 内部；要观测它们需要禁用 SDK 重试并在 `retryWithBackoff` 中重新实现。单独决策，不在阶段 4 中。
- **逐 token 流式指标**（token 间延迟、每块大小）。有助于推理引擎性能调试，但并非阶段 4 所针对的用户感知延迟问题。
- **针对推理/思考块的独立 TTFT。**“首 token”包含思考内容（见 D1）。未来可以拆分为 `ttft_to_reasoning_ms` 和 `ttft_to_answer_ms`，但前提是确定有需求。
- **将采样阶段作为专门的子 span。** 可通过 `duration_ms - ttft_ms - request_setup_ms` 计算；对于仅 OTel 的后端，添加子 span 没有额外价值（claude-code 仅为 Perfetto 使用一个）。改为作为 span 属性存储——见 D6。
- **持久重试模式 (`QWEN_CODE_UNATTENDED_RETRY`) 的事件级限流。** 单个 LLM 请求在持久重试下可能产生 50 多个 `ContentRetryEvent` / `ApiRetryEvent` 记录。限制发射量是后续工作——阶段 4 发射所有事件；如果生产量过大，可以在后续 PR 中添加每个 span 的发射量上限，并附上一个"+N 次更多尝试（截断）"的汇总事件。
- **`TOKEN_PROCESSING` 分解阶段。** 枚举值存在，但 qwen-code 没有真正的流后本地处理需要测量（典型值 <10ms）。在生产调用者中跳过；枚举值保留供将来使用或供我们无法控制的调用者使用。
- **将 `ContentRetryEvent` 迁移到 LLM span 作为 span 事件。** 与阶段 3 的 `subagent_execution` LogRecord 相同的原因：现有消费者（qwen-logger RUM、未来指标）与 LogRecord 紧密耦合。桥接 span 的覆盖已经足够。

## 参考资料（决策依据）

| 来源 | 关键要点 |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude-code (Anthropic) `claude.ts:1762, 1789, 1982, 2882` | TTFT 在 `message_start` SSE 事件上捕获为 `Date.now() - start`；`start` 每次重试重置。`requestSetupMs = start - startIncludingRetries`。`attemptStartTimes` 数组保留每次尝试。证实了方法的可行性；他们的 TTFT 语义是“第一个流事件”（我们不同，是“第一个内容”——见 D1） |
| claude-code `perfettoTracing.ts:549-671` | 将“请求建立 → 尝试 N（重试）→ 首 token → 采样”渲染为嵌套的 B/E 对。展示了视觉分解；qwen-code 使用 OTel 属性进行相同的分解，因为我们没有 Perfetto |
| claude-code `sessionTracing.ts:447` | 只有 `ttft_ms` 被放入 OTel span（没有 `requestSetupMs`、没有 `samplingMs`、没有每次尝试的时序）。我们有意在 span 上放置更多信息——claude-code 有 Perfetto 用于可视化；我们没有 |
| opencode (sst/opencode) `session/llm.ts`、`route/client.ts` | 没有 TTFT 测量。单个 `LLM.run` Effect span 覆盖一切。验证了跨竞争工具该缺口确实存在；不是参考要做的事 |
| [OTel GenAI 语义约定](https://opentelemetry.io/docs/specs/semconv/gen-ai/)（状态：开发/实验性） | `gen_ai.usage.input_tokens`（稳定）、`gen_ai.usage.output_tokens`（稳定）、`gen_ai.usage.cached_tokens`（实验性）、`gen_ai.request.model`（稳定）、`gen_ai.server.time_to_first_token`（实验性，双精度秒）。双发射模式遵循 #4410 的先例 |
| [OTel Trace 规范 — Span 事件](https://opentelemetry.io/docs/specs/otel/trace/api/#add-events) | “事件不应被用来记录更适合作为 Span 属性捕获的信息。”确认每次尝试的信息应属于 LLM span 属性 + 日志桥接 span，而不是作为父 span 上的 Span 事件 |
| 阶段 3 设计文档 (`telemetry-subagent-spans-design.md`) | 确立了双发射模式 (`qwen-code.subagent.id` + `gen_ai.agent.id`) 和“私有名称为权威”规则。阶段 4 对 TTFT 和 token 字段遵循相同约定 |

## 设计——七项决策，各有理据

### D1 — TTFT 语义：“包含用户可见内容的第一个块”

TTFT 测量从**成功尝试的**请求发送到**包含用户可见输出的第一个流块**的挂钟时间。如果 `candidates[0].content.parts` 中任何归一化的 `Part` 属于以下类型，则该块为“用户可见”：

- 非空字符串的 `text`
- `functionCall`（工具调用）
- `inlineData`（图像、二进制）
- `executableCode`
- `thought` / 推理内容（提供者表面上的任何内容——Gemini 的 `thought`、Anthropic 的 `<thinking>` 块、OpenAI o1 推理块）

仅包含 `role` 元数据或仅包含 `usageMetadata`（最终用量汇总块）的块不会触发 TTFT。

**为什么不是“任何类型的第一个流事件”（claude-code 的选择）**：claude-code 在 `message_start` 测量 TTFT，这是一个 Anthropic 特定的元数据事件，在实际内容出现前 50–300ms 触发。他们的内部 `headlessProfiler.ts` 已经将 `time_to_first_response_ms` 用于“用户看到了东西”的语义，承认了这种区别。qwen-code 支持多个提供者（Anthropic、OpenAI、Gemini、Qwen）——选择元数据事件语义意味着 Anthropic 的 TTFT 与 OpenAI 的 TTFT 完全不同（OpenAI 没有类似的纯元数据第一个事件）。用户可见内容语义在所有 4 个提供者中统一，且符合“首 token 时间”的字面含义。

**为什么包含 `thought` / 推理**：从运维人员角度看，推理块仍然是“模型输出了内容”。排除它们会低估推理密集型模型（o1、Qwen 思考变体）的 TTFT。未来拆分为 `ttft_to_reasoning_ms` 和 `ttft_to_answer_ms` 是可能的；不在阶段 4 中。

**为什么包含仅工具调用的块**：智能体工具决策 LLM 调用（一个 `tool_use`，无文本）在 qwen-code 的工作流中很常见。排除它们意味着这些请求的 TTFT 未定义。`functionCall` Part 是有意义的输出。

**跨产品比较说明**：设计文档明确指出 `qwen-code.ttft_ms ≈ claude-code.time_to_first_response_ms ≠ claude-code.ttft_ms`。跨产品比较的运维人员应统一使用用户可见内容语义。

### D2 — TTFT 测量位置：`LoggingContentGenerator.generateContentStream` 的方法局部变量

第一个块的检测运行在 `loggingContentGenerator.ts:393` 的现有流包装器内部 (`async function* processStreamGenerator`)。每次调用的变量 (`start`、`ttftMs`) 存在于方法的闭包中；**从不作为实例字段**。

**为什么从不使用实例字段**：`LoggingContentGenerator` 每个 `ContentGenerator` 实例化**一次** (`contentGenerator.ts:377`)，并在所有并发的 `generateContentStream` 调用间共享——子代理扇出、预热查询、来自 `geminiChat` 的侧查询。实例字段会因并发调用而被覆盖，从而在每两个交错请求中为一个请求生成无意义的 TTFT。

**为什么不用 AsyncLocalStorage**：ALS 可以工作，但为不需要逃逸出该方法的状态增加了一个上下文管理层。方法局部变量更简单、零开销、零泄露风险。

```ts
// loggingContentGenerator.ts — generateContentStream 内部
const attemptStart = Date.now(); // 每次调用局部变量
const requestEntryTime = Date.now(); // 也是每次调用局部变量——见 D3
let ttftMs: number | undefined;
const attemptStartTimes: number[] = [attemptStart];
let retryTotalDelayMs = 0;
let finalAttempt = 1;
// 流包装器检查每个块；第一个匹配 hasUserVisibleContent 的块：
//   ttftMs = Date.now() - attemptStart;
```

`hasUserVisibleContent(chunk)` 是一个小型独立辅助函数，与包装器同位置，导出供测试使用：

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
      // @ts-expect-error — `thought` 不在所有 SDK 版本中，但提供者会发射它
      p.thought !== undefined,
  );
}
```

### D3 — `request_setup_ms` 计算：进入时间与成功尝试开始时间

`request_setup_ms` 测量从 `generateContentStream`/`generateContent` 入口到**成功尝试开始**的挂钟时间——包括所有失败重试、退避休眠以及重试前的任何准备工作。

```ts
request_setup_ms = 成功尝试的 attemptStart - requestEntryTime;
```

当 `attempt === 1` 且没有发生重试时，`request_setup_ms` 很小（仅 SDK 建立）。当发生重试时，它捕获了整个重试预算开销。

**将其放在 OTel span 上（与 claude-code 不同，后者只放在 Perfetto 上）**：三层理由：

1. **没有 Perfetto** — qwen-code 没有带外可视化层。OTel 属性是唯一渠道。
2. **单 trace 调试** — 运维人员看到 `duration_ms=12000, request_setup_ms=11500, ttft_ms=200, sampling_ms=300` → 立即诊断“重试消耗了 11.5s，模型本身很快。”从其他字段计算 `request_setup_ms` 还需要暴露 `sampling_ms`，而我们正好会暴露（见 D6）。
3. **成本可忽略** — 1 个 INT64 属性。与现有的 `input_tokens`、`output_tokens` 属性量级相当。后端摄取成本不显著。

### D4 — 重试遥测：`retryWithBackoff` 的 `onRetry` 回调选项 + `ApiRetryEvent` + AsyncLocalStorage 传播

> **阶段 4b 更新（设计后发现）**：本节最初假设采用 claude-code 的“一个 LLM span 拥有重试循环”模式。在实现阶段 4b 时，我们发现 qwen-code 的 4 个 `retryWithBackoff` 调用点 (`client.ts:2109`、`baseLlmClient.ts:235,333`、`geminiChat.ts:2035`——以合并时的行号为准) 都包装了 `apiCall = () => contentGenerator.generateContent(...)`。重试层位于 **LoggingContentGenerator 之上**。每次重试都会重新调用 `apiCall()` → 新的 `qwen-code.llm_request` span。不存在跨尝试的单一共享 span。在 `LoggingContentGenerator` 中累积行不通。
>
> **解决方案**：通过 `AsyncLocalStorage` 传播重试状态（`packages/core/src/utils/retryContext.ts` 中的 `retryContext`）。`retryWithBackoff` 将每次 `await fn()` 包装在 `retryContext.run({ attempt, requestSetupMs, retryTotalDelayMs }, fn)` 中。`LoggingContentGenerator` 在其同步前导码中读取 ALS，并将值转发给 `endLLMRequestSpan`。这实际上提供了比原计划**更丰富**的可观测性——每个尝试的 span 都有自己的 `duration_ms` / `ttft_ms` / 错误详情，并通过每次尝试的 `attempt` / `requestSetupMs` / `retryTotalDelayMs` 属性知道它在重试预算中的位置。
>
> ALS 方法与代码库中已有的模式（`promptIdContext`、`subagentNameContext`、`agent-context`）相匹配——新增表面最小，语义易于理解。计划模式审查过程通过 3 轮审查发现了 22 个问题，均在合并前解决。

`retryWithBackoff` 当前调用 `logRetryAttempt` (`retry.ts:343`)，它仅写入 `debugLogger.warn`。我们扩展 `RetryOptions` 接口，添加一个可选的加入回调：

```ts
// utils/retry.ts
interface RetryOptions<T> {
  // ... 现有字段 ...
  /**
   * 可选。每次失败尝试后、退避休眠前调用。
   * 接收尝试次数（从 1 开始）、错误以及下次尝试前的延迟。
   * 用于为 LLM 调用点发射遥测事件；
   * 非 LLM 调用者（如 channels/weixin）保留 undefined，使其在 LLM 特定遥测通道中保持静默。
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

4 个 LLM 调用点 (`client.ts:1540`、`baseLlmClient.ts:193,282`、`geminiChat.ts:1039`) 注册一个回调，发射一个新的 `ApiRetryEvent`：
```ts
// types.ts — 新事件类，与 ContentRetryEvent 同级
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number; // 从1开始
  error_type: string;
  error_message: string; // 截断至256个字符
  status_code?: number;
  retry_delay_ms: number;
  // ... duration_ms 设为 retry_delay_ms，以便 LogToSpanProcessor 渲染
  // 出有意义的桥接 span 宽度
  duration_ms: number;
}
```

**为什么新建事件类，而非扩展 `ContentRetryEvent`**：

- `ContentRetryEvent` 有两个下游消费者（qwen-logger、log-record export）。修改其载荷可能导致破坏。
- “content retry” 在语义上指内容恢复重试（无效流、schema 修复）——将其扩展到涵盖限流重试会导致 schema 模糊。
- 新事件是增量添加的；不会让消费者感到意外。

**为什么不在 `retry.ts` 中嵌入回调**：`retry.ts` 也会被 `channels/weixin/src/api.ts` 调用（微软消息 API 重试）。在 retry.ts 中硬编码 LLM 遥测会导致非 LLM 重试时也发出 `ApiRetryEvent`。`onRetry` 回调由调用方选择启用——LLM 调用方选择启用，weixin 调用方则不启用。

**与 ContentRetryEvent 共存**：ContentRetryEvent 保持不变，用于 `geminiChat.ts:806,830` 中的内容恢复重试。ApiRetryEvent 覆盖来自 `retryWithBackoff` 的限流/5xx 重试。这两个事件从不同层触发，不会重复。通过 `LogToSpanProcessor`，两个事件的现有日志桥接行为均保留——两个事件都会自动嵌套在活跃的 LLM span 下（Phase 1 的接线保证了重试期间 LLM span 是活跃的）。

**持久重试模式（`QWEN_CODE_UNATTENDED_RETRY`）**：单个 429 循环请求可能发出 50+ 个事件。Phase 4 中暂不限制事件发射频率——如果生产环境量级无法承受，在后续 PR 中添加每 span 上限及汇总事件。父 LLM span 上聚合的 `attempt` 和 `retry_total_delay_ms`（D5）不受事件上限影响。

### D5——父 LLM span 聚合：仅标量属性（无 map 类型属性）

OTel span 属性是标量（`string | number | boolean | 这些类型的数组`）。Map 类型属性（如 `retry_count_by_status: {429:2, 503:1}`）需要 JSON 序列化且查询不便。跳过它们。

| 属性                          | 类型   | 语义                                                                                                                             |
| ----------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `attempt`                     | int    | 从 `retryContext.attempt` 获取的从1开始的单调递增计数器（当前尝试的迭代）。始终填充（无重试上下文时默认值为1）                   |
| `retry_total_delay_ms`        | int    | 本次尝试开始前的累积退避睡眠时间。直接调用时未定义；第1次尝试时为0；后续重试尝试时 >0                                           |
| `ttft_ms`                     | int    | 按 D1 定义的 TTFT；非流式或首个 chunk 前中止的请求该值未定义                                                                    |
| `request_setup_ms`            | int    | 按 D3 定义                                                                                                                       |
| `sampling_ms`                 | int    | 按 D6 定义                                                                                                                       |
| `output_tokens_per_second`    | double | 派生值；`output_tokens / (sampling_ms / 1000)`；当 `sampling_ms === 0` 时未定义                                                    |

每次尝试的状态码分布（例如“3次尝试中有2次是429”）可以通过 `ApiRetryEvent` 记录的日志桥接 span 查询。无需在父 span 上展平为单独属性。

**为什么在 span 上添加 `sampling_ms` 和 `output_tokens_per_second`**：虽然可以推导，但在后端查询中对多个 span 汇总时计算繁琐。与 `request_setup_ms`（D3）的成本收益相同。

### D6——为4个阶段中的3个激活 `recordApiRequestBreakdown()`

在 `endLLMRequestSpan`（或其包装函数）中，计算完 TTFT/setup/sampling 后，发出：

```ts
recordApiRequestBreakdown(config, model, [
  { phase: ApiRequestPhase.REQUEST_PREPARATION, durationMs: requestSetupMs },
  { phase: ApiRequestPhase.NETWORK_LATENCY, durationMs: ttftMs }, // ttftMs = 网络 + 首 token 生成
  { phase: ApiRequestPhase.RESPONSE_PROCESSING, durationMs: samplingMs },
]);
```

**为什么跳过 `TOKEN_PROCESSING`**：qwen-code 对流式 chunk 进行内联处理（合并发生在包装函数 `loggingContentGenerator.ts:644`）；流结束后封装阶段耗时<10ms，且架构上不独立。填入无意义的值会污染直方图。保留该枚举值不使用是安全的——`apiRequestBreakdownHistogram.record(value, {model, phase})` 只是一个以 `phase` 为标签的直方图；缺失的标签只是在查询中不出现。

**为什么不对 `NETWORK_LATENCY` 重命名**：该规范名称略有误导（它包含网络和首 token 生成，并非纯网络延迟），但是：

- 该枚举是 `metrics.ts:330-334` 的一部分，从 `index.ts:117` 导出并经过测试。
- 后端仪表盘可能已引用了这些阶段名称。
- 为了边际精度提升而重命名或添加新阶段，会造成破坏性更改。

在设计文档中记录语义；枚举保持不变。

**为什么放在 span 路径上而非并行**：使 `recordApiRequestBreakdown` 与 span 属性写入位于同一位置——单一门控发射点（见 D7 幂等性），单一顺序不变量。

### D7——`endLLMRequestSpan` 幂等性：指标记录受现有双重结束守卫门控

Phase 1.5（#4302）已确认 `endLLMRequestSpan` 可能被调用两次（中止路径 + 错误路径冲突）。`session-tracing.ts:~470` 处的现有守卫（`if (!activeSpans.has(...)) return;`）防止了 `span.end()` 的重复调用。Phase 4 的指标记录（D6）**必须位于同一守卫块内**，在 `span.end()` 之前：

```ts
// session-tracing.ts — endLLMRequestSpan
const llmCtx = activeSpans.get(spanRef);
if (!llmCtx) return;            // 已结束 — 双重结束守卫
activeSpans.delete(spanRef);    // 申领此次结束

// ... 计算持续时间，设置属性 ...
if (metadata) {
  recordApiRequestBreakdown(config, llmCtx.attributes.model, [...]);   // 新 — 门控
  recordTokenUsageMetrics(...); // 现有
}

span.end();
```

这保证了每次 LLM 请求**恰好记录一次**指标，与 span 生命周期一致。

**为什么不在 `loggingContentGenerator` 中记录**：它看不到中止路径。在 span 生命周期层记录，确保每个打开 span 的 LLM 请求（无论成功/失败/中止）都产生恰好一个 breakdown 样本。

### D8——GenAI 语义约定双发（私有名称权威）

每个 Phase 4 属性，如果对应 OTel GenAI 语义约定属性，则在 span 上写入两次：

| qwen-code 私有（权威） | GenAI 语义约定（兼容层）                        | 单位转换      | 规范状态    |
| ---------------------- | ----------------------------------------------- | ------------- | ----------- |
| `ttft_ms` (毫秒, int)  | `gen_ai.server.time_to_first_token` (秒, double)| `ttftMs / 1000` | 实验中 |
| `input_tokens` (int)   | `gen_ai.usage.input_tokens` (int)               | 相同          | 稳定        |
| `output_tokens` (int)  | `gen_ai.usage.output_tokens` (int)              | 相同          | 稳定        |
| `cached_input_tokens` (int) (存在时) | `gen_ai.usage.cached_tokens` (int)  | 相同          | 实验中 |
| `qwen-code.model` (string) | `gen_ai.request.model` (string)             | 相同          | 稳定        |

**LLM span 上已有的 token 属性名称**（Phase 4 之前在 `endLLMRequestSpan` 中设置）：qwen-code 已使用裸 `input_tokens` 和 `output_tokens`。Phase 4 增加了 `gen_ai.usage.*` 兄弟属性以匹配 #4410 的模式。裸名称保持不变；**不要重命名**。

没有 GenAI 语义约定等价物的字段——`request_setup_ms`、`sampling_ms`、`retry_total_delay_ms`、`attempt`、`output_tokens_per_second`——仅在 qwen-code 命名空间下发射。

**为什么是“私有权威，语义约定兼容”**：

- 内部仪表盘、SLO、debugLogger 输出、qwen-logger RUM、ARMS 查询——都引用 `ttft_ms` 等。将这些视为规范避免了迁移的标记日。
- 实验中的 GenAI 语义约定可能在达到稳定之前重命名 `gen_ai.server.time_to_first_token`。如果确实重命名，我们更新语义约定发射；qwen-code 的名称不动。
- 未来支持规范的的后端（Datadog AI 视图、Honeycomb AI、ARMS GenAI 仪表盘）会自动拾取 `gen_ai.*` 属性，无需我们参与。

**为什么双发需要单位转换**（毫秒 ↔ 秒）：GenAI 语义约定为延迟选择了秒-双精度；qwen-code 选择了毫秒-整数（与 span 上已有的 `duration_ms` 一致）。两种表示都有价值；转换成本很低。

## 辅助 API（增量添加到 `session-tracing.ts`）

```ts
// session-tracing.ts — LLMRequestMetadata 接口扩展（增量添加）
export interface LLMRequestMetadata {
  // ... 已有字段：inputTokens, outputTokens, cachedInputTokens, success, error, ...

  /** 从成功尝试开始到首个用户可见内容块的时间（毫秒）。非流式或首个 chunk 前中止的请求该值未定义。 */
  ttftMs?: number;

  /** 从 generateContent 入口到成功尝试开始的时间（毫秒）。包含所有失败重试 + 退避。 */
  requestSetupMs?: number;

  /** 最终尝试次数（从1开始）。1 = 无重试。 */
  attempt?: number;

  /** 成功尝试之前所有退避延迟的总和（毫秒）。 */
  retryTotalDelayMs?: number;
}

// 无新的导出辅助函数 — Phase 4 复用 startLLMRequestSpan / endLLMRequestSpan，只需扩展 metadata。
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
  duration_ms: number;  // = retry_delay_ms，驱动 LogToSpanProcessor 的桥接 span 宽度

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
  // ... 已有 ...
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number;
  error: unknown;
  errorStatus?: number;
  delayMs: number;
}

// 在 retryWithBackoff 内部，当前调用 logRetryAttempt 的地方：
options.onRetry?.({ attempt, error, errorStatus, delayMs: actualDelay });
logRetryAttempt(attempt, error, errorStatus); // 现有 debugLogger 调用不变
```

## 生命周期接线

### 流式路径（常见情况）

```ts
// loggingContentGenerator.ts:283 — generateContentStream
async generateContentStream(req, userPromptId): Promise<AsyncGenerator<GenerateContentResponse>> {
  const requestEntryTime = Date.now();
  let attemptStart = requestEntryTime;
  const attemptStartTimes: number[] = [attemptStart];
  let retryTotalDelayMs = 0;
  let finalAttempt = 1;

  // 使用现有的 startLLMRequestSpan (Phase 1)
  // 将 onRetry 回调传递给所使用的重试层：
  const onRetry: RetryAttemptInfo & { invoke: ... } = (info) => {
    finalAttempt = info.attempt + 1;        // 即将开始第 N+1 次尝试
    retryTotalDelayMs += info.delayMs;
    attemptStart = Date.now() + info.delayMs; // 近似值；实际重置在下次尝试开始时
    attemptStartTimes.push(attemptStart);
    // 发射 ApiRetryEvent
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

在 span 结束时（已在 Phase 1 的 `endLLMRequestSpan` 流中），将新字段包含在 `LLMRequestMetadata` 中：

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

`generateContent`（`loggingContentGenerator.ts:212`）不产生流式 chunk。TTFT 为 `undefined`；`request_setup_ms` 仍然有意义（捕获重试开销）。breakdown 指标记录2个阶段（REQUEST_PREPARATION + RESPONSE_PROCESSING，其中 `RESPONSE_PROCESSING = duration_ms - request_setup_ms`），而不是3个。

### 重试层集成（4个位置）

4个 LLM `retryWithBackoff` 调用点均添加 `onRetry`：

```ts
// client.ts:1540（类似 baseLlmClient.ts:193, 282, geminiChat.ts:1039）
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
    // 同时反馈给 LoggingContentGenerator 的本地重试累加器
    // （当在作用域内时——对于不经由 LoggingContentGenerator 的调用方，
    // LLM span 仍然会通过 metadata 路径获取 `attempt` 和 `retry_total_delay_ms`，
    // 因为 endLLMRequestSpan 是在 LLM 层调用的）
  },
});
```

非 LLM 调用方（`channels/weixin/src/api.ts`）**不注册 `onRetry`** —— 不会为其重试发射 `ApiRetryEvent`，与当前行为一致。

## 并发安全性——关键保证

`LoggingContentGenerator` 实例是共享的（每个 `ContentGenerator` 一个实例，`contentGenerator.ts:377`）。三个并发的 `generateContentStream` 调用（例如，3个子 agent 通过 `coreToolScheduler.runConcurrently` 扇出）会执行三个独立的 `generateContentStream` 闭包：

```
call_A: attemptStart_A, ttftMs_A, ... (闭包)
call_B: attemptStart_B, ttftMs_B, ... (闭包)
call_C: attemptStart_C, ttftMs_C, ... (闭包)
```

每个调用的局部变量不会重叠。流 chunk 基于每个调用自身的 `attemptStart` 检测。Span 属性在每个调用自身的 `endLLMRequestSpan` 中设置。

`AsyncLocalStorageContextManager`（由 NodeSDK 在 `sdk.ts:273` 注册）已经确保活跃的 OTel 上下文——因而传递给 `startLLMRequestSpan` 的父 span——在每个 fiber 中是正确的。

## 需要变更的文件

| 文件                                                                             | 变更                                                                                                                                                                                                                                    | 估计代码行数 |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `packages/core/src/telemetry/constants.ts`                                       | 添加 `EVENT_API_RETRY` 常量                                                                                                                                                                                                             | +2           |
| `packages/core/src/telemetry/types.ts`                                           | 添加 `ApiRetryEvent` 类 + 联合成员                                                                                                                                                                                                      | +40          |
| `packages/core/src/telemetry/loggers.ts`                                         | 添加 `logApiRetry()` 函数                                                                                                                                                                                                               | +20          |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`                         | 为 RUM 下游一致性添加 `logApiRetryEvent()`                                                                                                                                                                                              | +20          |
| `packages/core/src/telemetry/session-tracing.ts`                                 | 扩展 `LLMRequestMetadata`（ttftMs, requestSetupMs, attempt, retryTotalDelayMs）；扩展 `endLLMRequestSpan` 以设置新属性 + breakdown 指标 + 双发 gen_ai.*                                                                                  | +60          |
| `packages/core/src/telemetry/metrics.ts`                                         | 在 `endLLMRequestSpan` 内部接入 `recordApiRequestBreakdown` 调用点（无需修改现有记录器）                                                                                                                                                 | 0            |
| `packages/core/src/utils/retry.ts`                                               | 将 `onRetry?: (info: RetryAttemptInfo) => void` 添加到 RetryOptions；导出 `RetryAttemptInfo`；在现有 logRetryAttempt 位置调用回调                                                                                                         | +25          |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts`      | TTFT 捕获：方法局部累加器 + `hasUserVisibleContent` 辅助函数 + 流包装器中的首个 chunk 检测；将新 metadata 传递给 `endLLMRequestSpan`                                                                                                     | +80          |
| `packages/core/src/core/client.ts`                                               | 在 `retryWithBackoff` 调用点（`client.ts:1540`）接入 `onRetry` 回调                                                                                                                                                                     | +15          |
| `packages/core/src/core/baseLlmClient.ts`                                        | 在2个 `retryWithBackoff` 调用点接入 `onRetry` 回调                                                                                                                                                                                      | +25          |
| `packages/core/src/core/geminiChat.ts`                                           | 在 `retryWithBackoff` 调用点（`geminiChat.ts:1039`）接入 `onRetry` 回调                                                                                                                                                                 | +15          |
| `packages/core/src/telemetry/session-tracing.test.ts`                            | `endLLMRequestSpan` 设置 ttft_ms / request_setup_ms / attempt / retry_total_delay_ms / sampling_ms / output_tokens_per_second + gen_ai 双发 + breakdown 指标（每个阶段）+ 幂等结束                                                       | +120         |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.test.ts` | `hasUserVisibleContent`（text / functionCall / inlineData / executableCode / thought / role-only / usage-only）；并发调用不会交叉污染；首个 chunk 前中止时 TTFT 未定义；非流式时 TTFT 未定义                                         | +100         |
| `packages/core/src/utils/retry.test.ts`                                          | `onRetry` 在每次失败尝试时被调用，带有正确的 `attempt`、`delayMs`、`error`、`errorStatus`；缺少 `onRetry` 时静默（不发射遥测）                                                                                                         | +50          |
| `packages/core/src/telemetry/loggers.test.ts`                                    | `logApiRetry` 发出带有预期载荷的 LogRecord；通过 LogToSpanProcessor 桥接到活跃 LLM span 下的嵌套 span                                                                                                                                    | +40          |
总共：14 个文件，约 610 LOC。比阶段 2（#4321）大，但与阶段 3（#4410）相当，且集成广度（4 个重试点 + 遥测基础结构 + 流式包装器）证明其合理性。

如果审查认为体积过大：可拆分为 **阶段 4a + 4b + 4c**：

- **4a**（~200 LOC）：TTFT 捕获 + 扩展的 `LLMRequestMetadata` + 双发射。独立价值（从第一天起即可获得 TTFT 可见性）。
- **4b**（~250 LOC）：`onRetry` 回调 + `ApiRetryEvent` + 4 个调用方接线。**独立地修复** `retryWithBackoff` 的遥测缺口。
- **4c**（~160 LOC）：激活 `recordApiRequestBreakdown` + 父 span 聚合属性（`attempt`、`retry_total_delay_ms`、`sampling_ms`、`output_tokens_per_second`）。依赖于 4a + 4b。

## 测试策略

| 测试                                                                                                                                    | 验证内容                                |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `hasUserVisibleContent` 对于 text/functionCall/inlineData/executableCode/thought 返回 true                                              | D1 跨部分类型的语义                      |
| `hasUserVisibleContent` 对于仅含 role 和仅含 usage 的 chunk 返回 false                                                                   | D1 负面情况                             |
| 流式：TTFT 从尝试开始到第一个用户可见 chunk 的时间                                                                                        | 端到端 TTFT 检测                         |
| 流式：如果流在任何用户可见 chunk 之前中止，TTFT 为 undefined                                                                              | 边界情况                                |
| 流式：TTFT 从最终尝试的开始时间计算（而非首次尝试）                                                                                       | D3 — 重试时 TTFT 重置                    |
| 非流式：TTFT 保持为 undefined                                                                                                           | S3 决策                                 |
| 并发的 `generateContentStream` 调用不会交叉污染 TTFT                                                                                     | D2 — 方法局部保证                        |
| `endLLMRequestSpan` 设置所有阶段 4 的属性（ttft_ms、request_setup_ms、sampling_ms、attempt、retry_total_delay_ms、output_tokens_per_second） | 属性存在性                              |
| `endLLMRequestSpan` 双发射 gen_ai.server.time_to_first_token + gen_ai.usage.\* + gen_ai.request.model                                   | D8 双发射                               |
| `endLLMRequestSpan` 记录分解指标，流式 3 个阶段，非流式 2 个阶段                                                                          | D6                                      |
| `endLLMRequestSpan` 被调用两次：指标只记录一次，属性不再重置                                                                               | D7 幂等性                               |
| `retryWithBackoff` 带有 `onRetry`：每次失败尝试时调用回调，参数正确                                                                        | D4 回调契约                             |
| `retryWithBackoff` 不带 `onRetry`：不发出遥测（对非 LLM 调用者保持静默）                                                                   | P2 — channels/weixin 范围保护           |
| `client.ts` / `baseLlmClient.ts` / `geminiChat.ts` 重试点在重试时发出 `ApiRetryEvent`                                                     | D4 在 4 个站点的集成                     |
| `ApiRetryEvent` LogRecord 通过 LogToSpanProcessor 桥接到活动 LLM span 下的子 span                                                          | 追踪树正确性                            |
| LLM span 的 `attempt` 字段正确反映重试下的最终尝试次数                                                                                    | D5 聚合                                 |
| LLM span 的 `retry_total_delay_ms` 正确累加 onRetry 延迟                                                                                  | D5 聚合                                 |
| 当 `sampling_ms === 0`（无流式）时，`output_tokens_per_second` 为 undefined                                                               | 避免除以零                              |

## 边界情况

| 情况                                                                             | 处理方式                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 流在任何 chunk 到达前中止                                                         | `ttftMs = undefined`，`sampling_ms = undefined`，`output_tokens_per_second = undefined`。`attempt`、`request_setup_ms` 仍然设置。`success = false`                                                                       |
| 流在第一个 chunk 后中止                                                          | `ttftMs` 已设置；`sampling_ms = duration_ms - ttftMs - request_setup_ms`；反映部分响应时间。`success = false`                                                                                                             |
| 重试在第 1 次尝试成功（无重试）                                                    | `attempt = 1`，`retry_total_delay_ms = 0`，不发出 `ApiRetryEvent`，分解指标记录接近 0 的 `request_setup_ms`                                                                                                                |
| 持久重试模式，50+ 次尝试                                                          | 发出 50+ 条 `ApiRetryEvent` 记录（超出范围，限制推迟）；LLM span `attempt = 51`，`retry_total_delay_ms = 所有延迟之和。操作员在 span 上看到聚合视图；完整每次尝试细节在日志桥接 span 中                              |
| 非 LLM `retryWithBackoff` 调用方（channels/weixin）                               | 未注册 `onRetry`；仅触发现有的 `debugLogger.warn`。不发出 `ApiRetryEvent`；没有分解指标（调用方不是 LLM 站点）                                                                                                          |
| `endLLMRequestSpan` 被调用两次（中止 + 错误竞争）                                  | 阶段 1.5 的守卫在 `activeSpans.delete()` 处第二次调用时提前返回；`recordApiRequestBreakdown` 位于守卫内部，只记录一次                                                                                                    |
| Anthropic `message_start` chunk 在内容之前到达                                    | `hasUserVisibleContent` 对其返回 false（没有包含 text/functionCall 等的 parts）；TTFT 直到后续 `content_block_delta` chunk 才触发                                                                                        |
| OpenAI 第一个 chunk 只有空 `delta.content` 但包含 `role`                           | `hasUserVisibleContent` 返回 false；TTFT 直到第一个带非空 delta 的 chunk 才触发                                                                                                                                           |
| 仅工具调用响应（无文本）                                                           | 第一个包含 `functionCall` Part 的 chunk 触发 TTFT；`output_tokens_per_second` 基于工具调用 token 数量计算                                                                                                                 |
| 并发子代理（3 个调用同时进行）                                                      | 每个调用的闭包拥有自己的 `attemptStart`、`ttftMs`、`attemptStartTimes`。每个调用的 span 在 `endLLMRequestSpan` 时接收自己的元数据。不会交错（D2）                                                                         |
| openai-sdk 内部的 SDK 级重试（`maxRetries=3`）                                     | 对 qwen-code 遥测不可见——完全发生在 SDK 内部，在 retryWithBackoff 看到请求之前。`attempt` 仅反映 retryWithBackoff 的尝试次数。超出范围（参见 超出范围）                                                                  |
| `gen_ai.server.time_to_first_token` 规范在变为 Stable 之前重命名                    | 单文件更新：`session-tracing.ts:endLLMRequestSpan`。qwen-code 原生的 `ttft_ms` 保持权威性——无下游影响                                                                                                                    |
| 子代理的 LLM 请求                                                                 | 父级是子代理 span（阶段 3）。阶段 4 字段正确嵌套。按 `qwen-code.subagent.id` 分组的聚合提供每个子代理的 LLM 性能——设计文档未来之选，易于后续跟进                                                                          |
| 带有长思考块的推理模型                                                              | 第一个 `thought` Part 触发 TTFT；`sampling_ms` 包含思考 + 回答两个阶段。拆分为独立指标推迟                                                                                                                               |

## 回滚

该变更是 OTel 和指标层面的附加性——每个新属性都是可选的，每个新事件都是新类。现有不基于新字段过滤的仪表板保持工作不变。

影响行为的变化：

- 新的 `ApiRetryEvent` LogRecord 开始流动 → 日志量按重试率比例增加（通常 <1% 的请求会重试）。如果需要，可在 SDK 层对 LogRecord 采样以缓解。
- 新的分解指标 `qwen-code.api.request.breakdown` 开始产生时间序列 → Prometheus 基数略有增加（`{model, phase}` — 有界）。
- 派生属性 `output_tokens_per_second` 可能在过滤“所有属性”的仪表板上显得异常——做好文档说明。

回滚路径：撤销单个 PR（或 4a/4b/4c 各自独立撤销）。所有新字段使用防御性默认值（undefined / 0），不会改变 span 结构。

## 排序

- **在阶段 3（#4410，审查中）之后**：并非硬性依赖。阶段 4 的属性附加到 `qwen-code.llm_request` span，无论其父级是 `qwen-code.subagent`（阶段 3）还是 `qwen-code.interaction`（阶段 1）。建议先落地阶段 3，这样子代理子树下的每次尝试聚合能正常工作。
- **独立于 #4384**（`traceparent` + `X-Qwen-Code-Session-Id` 出站传播）。它们涉及 HTTP 层；阶段 4 涉及流/重试/指标层。
- **独立于 `clearDetailedSpanState` 聊天压缩后续**（#4097 后续）。不同的接触面。

## 未解决问题

1. **`onRetry` 回调触发语义**：在退避休眠**之前**（当前提议）还是**之后**（下一次尝试即将开始时）调用？之前更简单——回调立即拥有所有信息；之后则需要单独捕获刚刚完成的延迟。推荐休眠前触发；在回调契约中说明。
2. **LLM span 上的每次尝试时间**：是否应添加 `attempt_durations_ms: number[]` 数组？OTel 支持原始类型数组属性。对于“N 次尝试中哪一次慢”的诊断很有用。推迟，直到生产数据显示需求——日志桥接 span 已经携带了等效信息。
3. **持久重试模式发射限制**：在 `attempt > N` 的哪个阈值开始采样？`N = 5` 后 1/10 采样？`N = 10` 后仅汇总？推迟，直到有生产数据量。
4. **`TOKEN_PROCESSING` 阶段**：保留枚举值休眠状态，还是将其连接到某个东西（例如合并时间）？推迟——等待真实用例。
5. **子代理级别的 LLM 汇总**：阶段 4 落地后很容易跟进——按子代理子树求和 `ttft_ms`/`output_tokens`/`input_tokens`。不在阶段 4 范围内，但数据流使其成为可能。