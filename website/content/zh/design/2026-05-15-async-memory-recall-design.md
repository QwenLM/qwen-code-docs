# 异步记忆召回 — 设计规范

**日期：** 2026-05-15
**状态：** 已批准
**相关 Issue：** #3761, #3759
**相关 PR：** #3814, #3866

---

## 问题

`relevanceSelector.ts` 使用了 `AbortSignal.timeout(1_000)`（由 #3866 引入）。在首次会话冷启动时，qwen3.5-flash 平均耗时约 908 毫秒，持续触及 1 秒阈值。`resolveAutoMemoryWithDeadline` 中外层 2.5 秒的截止时间意味着，即使召回始终失败，每个 `UserQuery` 也可能阻塞长达 2.5 秒。

根本原因：主智能体请求路径在向模型发送之前 `await` 了召回结果。召回侧查询的任何延迟都会直接增加用户可见的延迟。

---

## 设计

### 核心思想

在 `UserQuery` 时触发召回，但永远不 `await` 它。在两个机会点消费结果——以先触发者为准：

1. **UserQuery 消费点**——在 `turn.run()` 之前进行同步的 `settledAt !== null` 检查。零等待：如果已经完成，直接使用；否则跳过。
2. **ToolResult 注入点**——在每个 `ToolResult` 轮次上进行相同的检查。将记忆作为 `system-reminder` **追加到** `requestToSend` 中的 `functionResponse` 部分之后，在模型响应之前为其提供记忆上下文。（追加而非前置：Qwen API 要求 `functionResponse` 紧跟在模型的 `functionCall` 之后——参见现有的 `hasPendingToolCall` IDE 上下文跳过，理由相同。）

这与上游 Claude Code 使用的模式相匹配（`startRelevantMemoryPrefetch` / `query.ts` 中的 `settledAt` 轮询）。

---

## 数据结构

### 新类型 `MemoryPrefetchHandle`（在 `client.ts` 中）

```typescript
type MemoryPrefetchHandle = {
  promise: Promise<RelevantAutoMemoryPromptResult>;
  /** 由 promise.finally() 设置。在 promise 完成前为 null。 */
  settledAt: number | null;
  /** 在记忆被注入后设为 true——防止重复注入。 */
  consumed: boolean;
  controller: AbortController;
};
```

### `GeminiClient` 上的字段变更

| 移除                                                       | 添加                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| `pendingRecallAbortController: AbortController \| undefined` | `pendingMemoryPrefetch: MemoryPrefetchHandle \| undefined` |

---

## 变更

### 1. `client.ts` — 移除 `resolveAutoMemoryWithDeadline`

完全删除该函数。由 `settledAt` 标志机制替代。

### 2. `client.ts` — UserQuery 触发路径

将 `resolveAutoMemoryWithDeadline` 调用替换为：

```typescript
// 在安装新 handle 之前，终止来自前一个 UserQuery 的任何正在进行中的预取
// （当用户在召回完成前再次输入时，防止产生孤立的侧查询）。
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;

const controller = new AbortController();
// 将调用者的信号桥接到预取控制器，以便父轮次的用户中止
// （Ctrl-C / Esc）也能终止召回侧查询。
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
      debugLogger.warn('托管自动记忆召回预取失败。', error);
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
// 不 await —— 立即继续
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
  const result = await prefetchHandle.promise; // 已经完成，立即返回
  if (result.prompt) {
    // 使用 unshift 而非 push：将记忆放在 systemReminders 的前面，以便在
    // UserQuery 轮次中它成为 system-reminder 块的头部。（ToolResult
    // 轮次则追加到 requestToSend 中以保持 functionCall /
    // functionResponse 配对——参见下文。）
    systemReminders.unshift(result.prompt);
    for (const doc of result.selectedDocs) {
      this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
    }
  }
}
```

### 4. `client.ts` — ToolResult 注入点（新增）

在组装 `requestToSend` 之后，`turn.run()` 之前添加：

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
      // 追加（不前置）以保持 functionResponse 部分在前，
      // 确保在原生 Gemini 路径上不破坏模型的 functionCall/functionResponse 配对。
      requestToSend = [...requestToSend, result.prompt];
      for (const doc of result.selectedDocs) {
        this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
      }
    }
  }
}
```

### 5. `client.ts` — 清理路径

通过两个不同的机制释放 handle：

**5 个终止并清除的位置**（预取仍在进行中，在丢弃引用前终止控制器）。将 `pendingRecallAbortController?.abort()` + `= undefined` 替换为：

```typescript
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;
```

位置：`resetChat()`、`MaxSessionTurns` 提前返回、`boundedTurns=0` 提前返回、`SessionTokenLimitExceeded` 提前返回、Arena 控制信号提前返回。触发路径本身在收到新的 UserQuery 时，如果前一个预取仍在进行中，也会执行这种先终止再替换的操作。

**2 个仅清除的位置**（预取已经完成，我们正在消费它——无需终止控制器，仅丢弃引用）：

```typescript
prefetchHandle.consumed = true;
this.pendingMemoryPrefetch = undefined;
```

位置：UserQuery 消费点、ToolResult 注入点。

### 6. `relevanceSelector.ts` — 移除 `AbortSignal.timeout(1_000)`

移除组合的 `AbortSignal.any([AbortSignal.timeout(1_000), callerAbortSignal])`，直接传递 `callerAbortSignal`。

---

## 行为对比

| 场景                                     | 之前                         | 之后                                                  |
| -------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| 召回在模型准备前完成                           | 在 UserQuery 上注入，~0 等待   | 在 UserQuery 上注入，~0 等待                           |
| 召回慢（冷启动）                     | 阻塞最多 2.5 秒              | 跳过 UserQuery，在第一个 ToolResult 上注入             |
| 召回超时（1 秒）                       | 终止，返回空结果，无记忆 | 无硬超时；在完成时注入               |
| 无工具调用，召回慢                   | 阻塞最多 2.5 秒，然后跳过   | 跳过 UserQuery，无 ToolResult 机会——遗漏       |
| 用户在召回完成前发送第二条消息 | 第二次召回与第一个 handle 竞速    | 第二个 UserQuery 触发新 handle 时，第一个 handle 被终止 |

---

## 不在此范围内

- 将记忆注入格式从 `system-reminder` 改为 `tool-result` 附件（CC 风格）
- 基于每次会话的字节预算跳过门控
- 单词提示跳过门控