# 异步记忆召回 — 设计规范

**日期：** 2026-05-15
**状态：** 已批准
**相关 issue：** #3761, #3759
**相关 PR：** #3814, #3866

---

## 问题

`relevanceSelector.ts` 使用了 `AbortSignal.timeout(1_000)`（由 #3866 引入）。在首次会话冷启动时，qwen3.5-flash 平均耗时约 908 ms，持续逼近 1 s 阈值。`resolveAutoMemoryWithDeadline` 中外层 2.5 s 的截止时间意味着，即使召回始终失败，每次 UserQuery 也可能阻塞长达 2.5 s。

根本原因：主 agent 请求路径在将请求发送给模型之前 `await` 了召回结果。召回侧查询的任何延迟都会直接增加用户可感知的延迟。

---

## 设计

### 核心思路

在 UserQuery 时触发召回，但不 await 它。在以下两个机会消费点中取先到者使用结果：

1. **UserQuery 消费点** — 在 `turn.run()` 之前同步检查 `settledAt !== null`。零等待：若已完成则使用，否则跳过。
2. **ToolResult 注入点** — 在每次 ToolResult turn 时进行同样的检查。将记忆作为 `system-reminder` **追加**到 `requestToSend` 中 functionResponse 部分之后，在模型下一次响应前提供记忆上下文。（追加而非前置：Qwen API 要求 functionResponse 紧跟模型的 functionCall——参见现有 `hasPendingToolCall` IDE 上下文跳过逻辑中相同的约束。）

此方案与 Claude Code 上游的模式一致（`query.ts` 中的 `startRelevantMemoryPrefetch` / `settledAt` 轮询）。

---

## 数据结构

### 新类型 `MemoryPrefetchHandle`（位于 `client.ts`）

```typescript
type MemoryPrefetchHandle = {
  promise: Promise<RelevantAutoMemoryPromptResult>;
  /** 由 promise.finally() 设置。promise 完成前为 null。 */
  settledAt: number | null;
  /** 记忆注入后置为 true，防止重复注入。 */
  consumed: boolean;
  controller: AbortController;
};
```

### `GeminiClient` 字段变更

| 移除                                                         | 新增                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| `pendingRecallAbortController: AbortController \| undefined` | `pendingMemoryPrefetch: MemoryPrefetchHandle \| undefined` |

---

## 变更内容

### 1. `client.ts` — 移除 `resolveAutoMemoryWithDeadline`

完全删除该函数，由 `settledAt` 标志机制替代。

### 2. `client.ts` — UserQuery 触发路径

将 `resolveAutoMemoryWithDeadline` 调用替换为：

```typescript
// 在安装新 handle 前中止任何前一次 UserQuery 正在进行的预取
//（防止用户在召回完成前再次输入时产生孤立侧查询）。
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;

const controller = new AbortController();
// 将调用方的 signal 桥接到预取 controller，使父 turn 的用户中止
//（Ctrl-C / Esc）同样能终止召回侧查询。
const onParentAbort = () => controller.abort();
if (signal.aborted) {
  controller.abort();
} else {
  signal.addEventListener('abort', onParentAbort, { once: true });
}

const promise = this.config
  .getMemoryManager()
  .recall(projectRoot, partToString(request), {
    config: this.config,
    excludedFilePaths: this.surfacedRelevantAutoMemoryPaths,
    abortSignal: controller.signal,
  })
  .catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      debugLogger.warn('Managed auto-memory recall prefetch failed.', error);
    }
    return EMPTY_RELEVANT_AUTO_MEMORY_RESULT;
  });

const handle: MemoryPrefetchHandle = {
  promise,
  settledAt: null,
  consumed: false,
  controller,
};
void promise.finally(() => {
  handle.settledAt = Date.now();
  signal.removeEventListener('abort', onParentAbort);
});
this.pendingMemoryPrefetch = handle;
// 不 await — 立即继续
```

### 3. `client.ts` — UserQuery 消费点（替换 `await relevantAutoMemoryPromise`）

```typescript
const prefetchHandle = this.pendingMemoryPrefetch;
if (
  prefetchHandle &&
  prefetchHandle.settledAt !== null &&
  !prefetchHandle.consumed
) {
  prefetchHandle.consumed = true;
  this.pendingMemoryPrefetch = undefined;
  const result = await prefetchHandle.promise; // 已完成，立即返回
  if (result.prompt) {
    // 使用 unshift 而非 push：将记忆置于 systemReminders 开头，
    // 使其在 UserQuery turn 的 system-reminder 块中位于最前。
    //（ToolResult turn 则追加到 requestToSend，以保留
    // functionCall / functionResponse 的配对——见下文。）
    systemReminders.unshift(result.prompt);
    for (const doc of result.selectedDocs) {
      this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
    }
  }
}
```

### 4. `client.ts` — ToolResult 注入点（新增）

在 `requestToSend` 组装完成后、`turn.run()` 之前，添加：

```typescript
if (messageType === SendMessageType.ToolResult) {
  const prefetchHandle = this.pendingMemoryPrefetch;
  if (
    prefetchHandle &&
    prefetchHandle.settledAt !== null &&
    !prefetchHandle.consumed
  ) {
    prefetchHandle.consumed = true;
    this.pendingMemoryPrefetch = undefined;
    const result = await prefetchHandle.promise;
    if (result.prompt) {
      // 追加（而非前置），使 functionResponse 部分保持在前，
      // 不破坏原生 Gemini 路径上模型的
      // functionCall/functionResponse 配对。
      requestToSend = [...requestToSend, result.prompt];
      for (const doc of result.selectedDocs) {
        this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
      }
    }
  }
}
```

### 5. `client.ts` — 清理路径

handle 通过两种不同机制释放：

**5 个中止并清除的位置**（预取仍在进行中，中止 controller 后再释放引用）。将 `pendingRecallAbortController?.abort()` + `= undefined` 替换为：

```typescript
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;
```

位置：`resetChat()`、`MaxSessionTurns` 提前返回、`boundedTurns=0` 提前返回、`SessionTokenLimitExceeded` 提前返回、Arena 控制信号提前返回。触发路径本身在新 UserQuery 到达而上一个预取仍在进行时，也会执行中止后替换操作。

**2 个仅清除的位置**（预取已完成并正在消费——无需中止 controller，仅释放引用）：

```typescript
prefetchHandle.consumed = true;
this.pendingMemoryPrefetch = undefined;
```

位置：UserQuery 消费点、ToolResult 注入点。

### 6. `relevanceSelector.ts` — 移除 `AbortSignal.timeout(1_000)`

移除 `AbortSignal.any([AbortSignal.timeout(1_000), callerAbortSignal])` 的组合用法，直接传入 `callerAbortSignal`。

---

## 行为对比

| 场景                                  | 变更前                        | 变更后                                          |
| ------------------------------------- | ----------------------------- | ----------------------------------------------- |
| 召回在模型准备前完成                  | 在 UserQuery 注入，等待约 0   | 在 UserQuery 注入，等待约 0                     |
| 召回缓慢（冷启动）                    | 阻塞最长 2.5 s                | 跳过 UserQuery，在首个 ToolResult 注入           |
| 召回超时（1 s）                       | 中止，空结果，无记忆          | 无硬超时；完成后随时注入                        |
| 无工具调用且召回缓慢                  | 阻塞最长 2.5 s 后跳过         | 跳过 UserQuery，无 ToolResult 机会——错过          |
| 用户在召回完成前发送第二条消息        | 第二次召回与第一个 handle 竞争 | 第二次 UserQuery 触发新 handle 时，第一个被中止 |

---

## 范围外

- 将记忆注入格式从 `system-reminder` 改为 `tool-result` 附件（CC 风格）
- 按会话字节预算跳过门控
- 单词提示跳过门控
