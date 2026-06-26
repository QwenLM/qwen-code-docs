# 设计：OpenAI 兼容管道的流式非活动超时

- **日期：** 2026-06-24
- **组件：** `packages/core` — `openaiContentGenerator/pipeline.ts`
- **状态：** 已批准设计（审查7轮），准备好进行 TDD
- **范围：** 仅涉及措施 #1 + #2（看门狗 + 中止 + 模拟 ETIMEDOUT）。不在范围内：向 UI 发送终端 SSE 事件（#9）、非流式路径。

## 问题

一个 DataAgent 事件（"一直运行不返回"）根因定位到模型网关（阿里云 PrivateLink → DashScope/Bailian `compatible-mode`，qwen3.7-max）已接受请求（HTTP 200）但**没有流式返回任何内容**——SSE 连接保持打开且静默约 595 秒，没有 `finish_reason`。

qwen-code 无法有效恢复：

- OpenAI 客户端的 `timeout`（`DEFAULT_TIMEOUT = 120_000`）是**请求级别**的（连接 + 获取响应对象）。一旦 `chat.completions.create({stream:true})` 在快速 200 后返回流，`for await` 期间的 chunk 间非活动状态是**无上限的**。
- 唯一的非活动计时器（`loggingContentGenerator.ts` 中的 `STREAM_IDLE_TIMEOUT_MS = 5min`）仅用于**遥测**——它会关闭 OTel span 以避免泄漏，但**不会**中止请求或抛出异常。

因此，一个 200 后静默的流会一直挂起，直到连接断开或 30 分钟交互 TTL 到期，而内容重试循环（`NO_FINISH_REASON`）永远无法触发，因为流从未完成。

## 关键洞察

传输层本应在空闲 socket 上产生 `ETIMEDOUT`，但实际上没有（socket 保持打开且没有数据）。修复方法是**添加传输层缺失的非活动超时，并模拟它未能发出的 `ETIMEDOUT`**——使静默停顿与实际读取超时无法区分，现有的重试/退避/降级栈已经能够处理这种情况。

## 已验证的机制（审计）

1. `pipeline.executeStream` 创建 `perRequestAc = createChildAbortController(parentSignal)` 并将 `perRequestAc.signal` 传递给 SDK。这是实际上取消 fetch 的控制器。上一层的日志包装器只有只读信号——所以看门狗必须位于**pipeline**中。
2. `classifyRetryError` **首先**检查 `isRetryAbortError`（isAbortError || name==='CanceledError'）→ 任何中止 = `{kind:'abort', diagnosis:'fail-fast'}` = **不可重试**。因此看门狗不能暴露原始的 AbortError。
3. `getTransportCode(err)` 读取 `err.code` / `err.cause.code`；一个普通的 `Object.assign(new Error(...), {code:'ETIMEDOUT'})` → `{kind:'transport', diagnosis:'retryable', transportCode:'ETIMEDOUT'}`。
4. geminiChat 的流传输重试在 `classification.kind==='transport' && transportCode ∈ {ECONNRESET, ETIMEDOUT} && !streamYieldedChunk` 时触发（`TRANSPORT_STREAM_RETRY_CONFIG.maxRetries = 2`）。因此**首字节/零 chunk**超时（正是该事件）会自动重试；在**chunk 之后**的停顿会作为传输错误上报（不重试——可接受）。

## 决策（已锁定）

| 决策                               | 选择                                                              |
| ---------------------------------- | ----------------------------------------------------------------- |
| 超时值及配置                         | 新增 `contentGenerator.streamIdleTimeoutMs`，默认值 **120000ms**   |
| 超时时的行为                         | **中止 + 模拟 ETIMEDOUT**（重用传输重试）                           |
| PR 范围                             | **仅 #1 + #2**（终端 SSE 事件作为单独 PR）                         |
| 5 分钟遥测空闲计时器                  | **保留作为后盾**（不变）                                            |

## 设计

所有更改位于 `packages/core/src/core/openaiContentGenerator/`。

### 1. 配置

在 `ContentGeneratorConfig`（`contentGenerator.ts`）中添加 `streamIdleTimeoutMs?: number`。Pipeline 解析为 `this.contentGeneratorConfig.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS`（`120_000`）。值为 `<= 0` 时禁用看门狗（直通）。

### 2. 非活动超时生成器（`pipeline.ts`）

一个私有异步生成器在 `processStreamWithLogging` 之前包装**原始 SDK chunk 流**：

```ts
async function* withStreamInactivityTimeout(
  source: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
  idleMs: number,
  abortRequest: () => void, // 中止 perRequestAc → 释放 socket
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
          // 用户取消优先于我们的超时重新标记。
          // 使用普通 Error（而不是 DOMException）：错误清理通过
          // Object.create(getPrototypeOf(err)) 克隆，这会破坏 DOMException
          // （其 `name` 是一个克隆缺少的内部槽 getter）。`name ===
          // 'AbortError'` 满足 isAbortError。
          if (parentSignal?.aborted) {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          } else {
            abortRequest(); // 中止 perRequestAc → fetch 拆除
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
        // 我们中止后，孤立的 nextPromise 会以 AbortError 拒绝；
        // 吞掉它以避免未处理的拒绝。
        void Promise.resolve(nextPromise).catch(() => {});
        throw err;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (result.done) return;
      chunksReceived += 1;
      yield result.value; // 收到一个 chunk → 下一个循环启动新计时器
    }
  } finally {
    abortRequest();
    try {
      await it.return?.();
    } catch {
      // 上面的中止是最重要的清理；忽略返回失败。
    }
  }
}
```

计时器在**每个原始 chunk**（包括思考/推理增量）上重置，因此长时间思考并流式输出推理内容的模型永远不会被错误中止；只有真正的静默（在 `idleMs` 内没有 chunk）才会触发它。

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

### 3. 在 `executeStream` 中连接

在 Stage 1 创建 `stream` 之后、Stage 2 之前包装它。流式请求始终使用每个请求的控制器，因此即使调用者没有提供父信号，看门狗也能中止 SDK 请求：

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
// ...processStreamWithLogging(guarded, context, request) 保持原样，
// 保留现有的 drainThenCleanup 包装。
```

## 更改后的行为

- 200 后静默（零 chunk）→ 经过 `idleMs` 后：中止 fetch + 抛出 ETIMEDOUT → `{transport, retryable}` → 传输重试（×2，`!streamYieldedChunk`）→ 自动恢复；耗尽后作为传输错误上报。
- 部分 chunk 后停顿 → 抛出 ETIMEDOUT；`streamYieldedChunk` 为 true，因此**不会**进行传输重试——作为错误上报（无风险的中途数据重放）。
- 活跃流（包括思考）→ 计时器在每个 chunk 重置；永不触发。
- 父/用户中止 → AbortError 原样传播（快速失败的用户取消）。
- 5 分钟遥测空闲计时器成为约 120 秒看门狗的备用机制；保持不变。

## 不在范围内

- 重试耗尽时的终端 `turn_error` SSE（#9）——单独 PR。
- 非流式 `execute()`——已被 120 秒请求级超时限制。

## 测试（TDD）

在 `pipeline.test.ts` 中，使用 `vi.useFakeTimers()` 和可控的模拟流（产生 N 个 chunk 后 `next()` 返回一个永远不解决的 Promise）：

1. **零 chunk 停顿** → 消耗流在推进 `idleMs` 后以一个 `code === 'ETIMEDOUT'` 的错误拒绝。
2. **部分 chunk 后停顿** → 已产生的 chunk 正常通过，然后以 `code === 'ETIMEDOUT'` 拒绝。
3. **活跃流重置计时器** → 在 `idleMs` 内到达的 chunk 不会触发看门狗；流正常完成。
4. **父中止优先级** → 超时时父信号已中止，错误是 AbortError，而不是 ETIMEDOUT。
5. **`streamIdleTimeoutMs <= 0` 时禁用** → 挂起的流在计时器推进时不会抛出（直通）。
6. **自定义 `streamIdleTimeoutMs`** → 配置的值被遵守（按配置的毫秒数触发，而不是默认值）。
7. **孤立的 SDK `next()` 拒绝** → 看门狗中止请求后，挂起的 `next()` 随后产生的 SDK `AbortError` 拒绝被吞掉，不会触发 `unhandledRejection`。