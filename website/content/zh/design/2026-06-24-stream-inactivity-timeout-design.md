# 设计：OpenAI 兼容 pipeline 的流式非活动超时

- **日期：** 2026-06-24
- **组件：** `packages/core` — `openaiContentGenerator/pipeline.ts`
- **状态：** 设计已批准（经过 7 轮评审），准备进行 TDD
- **范围：** 仅包含措施 #1 + #2（看门狗 + 中止 + 合成 ETIMEDOUT）。不在范围内：向 UI 发送终端 SSE 事件 (#9)、非流式路径。

## 问题

DataAgent 的一次事故（“一直运行不返回”）的根本原因被追溯到模型网关（阿里云 PrivateLink → DashScope/Bailian `compatible-mode`，qwen3.7-max）接受了请求（HTTP 200），但随后**没有流式输出任何内容** —— SSE 响应体保持打开且静默了约 595 秒，没有返回 `finish_reason`。

qwen-code 缺乏有效的恢复机制：

- OpenAI 客户端的 `timeout`（`DEFAULT_TIMEOUT = 120_000`）是**请求级别**的（连接 + 获取响应对象）。一旦 `chat.completions.create({stream:true})` 在快速返回 200 后返回流，`for await` 期间的 chunk 间非活动时间是**无限制**的。
- 唯一的非活动计时器（`loggingContentGenerator.ts` 中的 `STREAM_IDLE_TIMEOUT_MS = 5min`）**仅用于遥测** —— 它用于关闭 OTel span 以防止泄漏，并**不会**中止请求或抛出异常。

因此，一个返回 200 后静默的流会一直挂起，直到连接断开或达到 30 分钟的交互 TTL，并且内容重试循环（`NO_FINISH_REASON`）永远不会触发，因为流从未完成。

## 核心洞察

传输层本应在 socket 空闲时产生 `ETIMEDOUT`，但实际上并没有（socket 保持打开且没有数据）。修复方法是**添加传输层缺失的非活动超时，并合成它未能发出的 `ETIMEDOUT`** —— 使得静默停滞与真实的读取超时无法区分，而现有的重试/退避/降级堆栈已经能够处理这种情况。

## 已验证的机制（评审）

1. `pipeline.executeStream` 创建 `perRequestAc = createChildAbortController(parentSignal)` 并将 `perRequestAc.signal` 传递给 SDK。这是实际取消 fetch 的 controller。上一层的 logging wrapper 只有只读的 signal —— 因此看门狗必须位于 **pipeline** 中。
2. `classifyRetryError` **首先**检查 `isRetryAbortError`（isAbortError || name==='CanceledError'） → 任何 abort 都会返回 `{kind:'abort', diagnosis:'fail-fast'}` = **不可重试**。因此看门狗**不能**抛出原始的 AbortError。
3. `getTransportCode(err)` 读取 `err.code` / `err.cause.code`；一个普通的 `Object.assign(new Error(...), {code:'ETIMEDOUT'})` 会返回 `{kind:'transport', diagnosis:'retryable', transportCode:'ETIMEDOUT'}`。
4. geminiChat 的 stream-transport-retry 在 `classification.kind==='transport' && transportCode ∈ {ECONNRESET, ETIMEDOUT} && !streamYieldedChunk`（`TRANSPORT_STREAM_RETRY_CONFIG.maxRetries = 2`）时触发。因此，**首字节 / 零 chunk** 超时（正是此次事故的情况）会自动重试；而在 chunk **之后**的停滞会作为传输错误抛出（不重试 —— 可接受）。

## 决策（已锁定）

| 决策                       | 选择                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| 超时值与配置               | 新增 `contentGenerator.streamIdleTimeoutMs`，默认 **120000ms**   |
| 超时时                     | **中止 + 合成 ETIMEDOUT**（复用 transport-retry）                |
| PR 范围                    | **仅 #1 + #2**（终端 SSE 事件在单独的 PR 中）                    |
| 5 分钟遥测空闲计时器       | **保留作为兜底**（不作修改）                                     |

## 设计

所有更改位于 `packages/core/src/core/openaiContentGenerator/`。

### 1. 配置

在 `ContentGeneratorConfig`（`contentGenerator.ts`）中添加 `streamIdleTimeoutMs?: number`。Pipeline 将其解析为 `this.contentGeneratorConfig.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS`（`120_000`）。值 `<= 0` 将禁用看门狗（直接透传）。

### 2. 非活动超时生成器（`pipeline.ts`）

一个私有的 async generator 在 `processStreamWithLogging` 之前包装**原始的 SDK chunk 流**：

```ts
async function* withStreamInactivityTimeout(
  source: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
  idleMs: number,
  abortRequest: () => void, // aborts perRequestAc → frees the socket
  parentSignal: AbortSignal | undefined,
): AsyncGenerator<OpenAI.Chat.ChatCompletionChunk> {
  const it = source[Symbol.asyncIterator]();
  const streamStartedAt = Date.now();
  let chunksReceived = 0;
  try {
    while (true) {
      const nextPromise = it.next();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // User cancel takes precedence over our timeout relabel.
          // Use a plain Error (NOT DOMException): error redaction clones via
          // Object.create(getPrototypeOf(err)), which corrupts a DOMException
          // (its `name` is an internal-slot getter the clone lacks). `name ===
          // 'AbortError'` satisfies isAbortError.
          if (parentSignal?.aborted) {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          } else {
            abortRequest(); // abort perRequestAc → fetch tears down
            reject(
              new StreamInactivityTimeoutError(
                idleMs,
                chunksReceived,
                Date.now() - streamStartedAt,
              ),
            ); // code: 'ETIMEDOUT'
          }
        }, idleMs);
        timer.unref?.();
      });
      let result: IteratorResult<OpenAI.Chat.ChatCompletionChunk>;
      try {
        result = await Promise.race([nextPromise, timeout]);
      } catch (err) {
        // After we abort, the orphaned nextPromise rejects with AbortError;
        // swallow it so it is not an unhandled rejection.
        void Promise.resolve(nextPromise).catch(() => {});
        throw err;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (result.done) return;
      chunksReceived += 1;
      yield result.value; // a chunk arrived → next loop starts a fresh timer
    }
  } finally {
    abortRequest();
    try {
      await it.return?.();
    } catch {
      // The abort above is the cleanup that matters; ignore return failures.
    }
  }
}
```

计时器在**每个原始 chunk**（包括 thinking/reasoning deltas）到达时**重置**，因此流式输出 reasoning 的长思考模型不会被错误中止；只有真正的静默（`idleMs` 内没有 chunk）才会触发它。

```ts
class StreamInactivityTimeoutError extends Error {
  readonly code = 'ETIMEDOUT' as const;

  constructor(
    readonly idleMs: number,
    readonly chunksReceived: number,
    readonly streamLifetimeMs: number,
  ) {
    super(`No stream activity for ${idleMs}ms (inactivity timeout)`);
    this.name = 'StreamInactivityTimeoutError';
  }
}
```

### 3. 在 `executeStream` 中接入

在阶段 1 创建 `stream` 后，在阶段 2 之前对其进行包装。流式请求始终使用 per-request controller，以便看门狗可以在调用方未提供 parent signal 的情况下中止 SDK 请求：

```ts
const idleMs =
  this.contentGeneratorConfig.streamIdleTimeoutMs ??
  DEFAULT_STREAM_IDLE_TIMEOUT_MS;
const guarded =
  idleMs > 0
    ? withStreamInactivityTimeout(
        stream,
        idleMs,
        () => perRequestAc.abort(),
        parentSignal,
      )
    : stream;
// ...processStreamWithLogging(guarded, context, request) as today,
// keeping the existing drainThenCleanup wrapper.
```

## 更改后的行为

- 200 后静默（零 chunk） → `idleMs` 后：中止 fetch + 抛出 ETIMEDOUT → `{transport, retryable}` → transport-retry（×2，`!streamYieldedChunk`） → 自动恢复；耗尽后作为传输错误抛出。
- 部分 chunk 后停滞 → 抛出 ETIMEDOUT；`streamYieldedChunk` 为 true，因此**不会**进行 transport-retry —— 作为错误抛出（不会在生成中途进行有风险的重放）。
- 活跃流（包括 thinking） → 计时器在每个 chunk 到达时重置；永远不会触发。
- 父级/用户中止 → AbortError 原样传播（快速失败的用户取消）。
- 5 分钟的遥测空闲计时器成为 ~120 秒看门狗抢占后的兜底机制；保持原样不作修改。

## 不在范围内

- 重试耗尽时的终端 `turn_error` SSE (#9) —— 单独的 PR。
- 非流式 `execute()` —— 已受 120 秒请求级超时的限制。

## 测试（TDD）

在 `pipeline.test.ts` 中，使用 `vi.useFakeTimers()` 和一个可控的 mock stream（yield N 个 chunk 后 `next()` 返回一个永不 resolve 的 promise）：

1. **零 chunk 停滞** → 消费该流会在推进 `idleMs` 后 reject，且错误的 `code === 'ETIMEDOUT'`。
2. **chunk 后停滞** → 已 yield 的 chunk 正常通过，随后 reject 且 `code === 'ETIMEDOUT'`。
3. **活跃流重置计时器** → 在 `idleMs` 内到达的 chunk 永远不会触发看门狗；流正常完成。
4. **父级中止优先** → 如果在超时时父级 signal 被中止，错误将是 AbortError，而不是 ETIMEDOUT。
5. **当 `streamIdleTimeoutMs <= 0` 时禁用** → 挂起的流在计时器推进时不会抛出异常（直接透传）。
6. **自定义 `streamIdleTimeoutMs`** → 遵循配置的值（在配置的毫秒数触发，而不是默认值）。
7. **孤立的 SDK `next()` rejection** → 在看门狗中止请求后，来自挂起的 `next()` 的后续 SDK `AbortError` rejection 会被吞掉，且不会触发 `unhandledRejection`。