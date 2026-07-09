# 设计：在 `invalid_client_id` 时进行 clientId 自愈 (DaemonSessionClient)

- **日期：** 2026-06-24
- **组件：** `packages/sdk-typescript` — `DaemonSessionClient`
- **依赖：** PR #5784 (`fix(daemon): Reject stale prompt client admission`) — **已合并** (`84745d0f0`)
- **状态：** 已实现（基于已合并的 #5784 构建）

## 问题

在 daemon 重启（或 session 重新加载）后，daemon 内存中的客户端注册信息会被清空。如果前端仍持有旧的服务器分配的 `clientId`，它将使用该过期的 id 发送 `POST /session/:id/prompt` 请求。bridge 的 `resolveTrustedClientId` 无法识别该 id，并以 `InvalidClientIdError` 拒绝该 prompt。

观察到的生产事故（trace `a76a31fe…`，daemon 日志 15:24）：prompt 由 `client_d019b847` 发送，而 session 已在不同的 id `client_ac36fac9` 下（重新）加载，因此发送 prompt 的客户端从未被注册。UI 无限期停留在“处理中”状态，因为该故障从未作为最终的 turn 事件暴露出来。

PR #5784 修复了*暴露问题*的一半：现在在 **admission 阶段**抛出 `invalid_client_id`，因此 `POST /session/:id/prompt` 会同步返回 `400 invalid_client_id`（无 `promptId`），而不是返回 `202` 然后静默异步失败。本设计增加了*自愈*的一半：当 SDK 收到该 `400` 错误时，它会重新注册以获取新的 `clientId` 并重试一次 prompt，从而让 turn 继续执行，无需用户手动重新发送。

## 范围

在范围内（仅限 SDK，`DaemonSessionClient`）：

- 在 prompt admission 调用时检测 `invalid_client_id`。
- 针对（已恢复的）session 重新注册客户端，以获取新的服务器分配的 `clientId`。
- 使用新的 `clientId` **重试一次** prompt。

明确在范围之外（YAGNI）：

- SSE 流重连——仍由应用层现有的职责负责（dataworks 应用已经拥有 `reloadSession`/重连逻辑）。`invalid_client_id` 仅在 admission 调用时暴露，绝不会在 SSE 等待时暴露。
- 其他携带 `clientId` 的方法（`btw`、`shell`、mid-turn message、`cancel`、`heartbeat`）的自愈。只有 `prompt()` 会进行自愈。
- 在 daemon 重启期间持久化 `clientId`。

## 关键不变量（已对照源码验证）

1. **重试是安全的，因为 `invalid_client_id` 是 admission 阶段的拒绝。**
   `resolveTrustedClientId` 在 `bridge.sendPrompt` 内部运行，在 turn 被注册之前以及路由发出 `202` 之前执行。借助 PR #5784，这会同步抛出异常 → 在接受之前返回 `400` → prompt **从未执行**。因此，重试不会导致用户的消息被重复执行。这个不变量是重试安全的唯一基础；它依赖于 #5784。

2. **`registerClient` 永远不会抛出异常，并且总是返回一个有效的 id。** 对于未知的 `requestedClientId`，它会回退到 `createClientId()` 并返回一个新的 `client_<uuid>`。只有 `resolveTrustedClientId`（由 prompt/cancel/… 使用）会抛出异常。因此，`load`/`resume` 调用总是返回一个可用的 `clientId`。

3. **restore 响应始终携带已注册的 `clientId`。** 现有条目快速路径和冷恢复路径都在响应中设置 `clientId: registerClient(entry, req.clientId)`。（`types.ts` 中“仅在调用方提供 clientId 时才回显”的说明适用于 `HeartbeatResult`，而不适用于 restore。）

4. **在重启场景下没有净 attach 泄漏，并且 `close()` 的正确性得到提升。** `resumeSession` 执行 `attachCount++`。引用计数递减通过 `/detach` → `detachClient`（`attachCount--` + `unregisterClient`）实现。`close()` → `DELETE /session/:id` → `closeSessionImpl` 是**全部销毁**：它通过 `resolveTrustedClientId` 验证 clientId，然后拆除 session（`byId.delete`），并随之丢弃 `attachCount`。daemon 重启会清除重启前的 attach；`reattach()` 会重新建立恰好一个 attach，随后的 `close()`/重启会将其全部拆除——没有净泄漏。注意 `closeSessionImpl` 也会验证 clientId，因此在此更改之前，重启后使用过期 id 调用 `close()` 本身就会抛出 `InvalidClientIdError`；在由 prompt 触发的 `reattach()` 之后，`this.clientId` 是有效的，因此 `close()` 会成功。（`close()` 本身并未进行自愈——在范围之外——但间接受益。）

5. **如果没有 PR #5784，此更改是无效的。** #5784 之前的 daemon 返回 `202` 然后异步失败，永远不会返回 `400 invalid_client_id`，因此谓词永远不会匹配，自愈也永远不会触发。是无害的空操作。

## 设计

所有更改都局限于 `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`。

### 1. `isInvalidClientId(err): boolean`

```ts
function isInvalidClientId(err: unknown): boolean {
  return (
    err instanceof DaemonHttpError &&
    err.status === 400 &&
    typeof err.body === 'object' &&
    err.body !== null &&
    (err.body as { code?: unknown }).code === 'invalid_client_id'
  );
}
```

需要从 `./DaemonHttpError.js` 导入 `DaemonHttpError`。

### 2. `reattach(): Promise<void>` — single-flight

```ts
private reattaching?: Promise<void>;

private async reattach(): Promise<void> {
  // 合并所有观察到 invalid_client_id 的并发 prompt，以便我们只重新注册一次（避免产生多余的 clientIds / attachCount 孤儿）。
  if (this.reattaching) return this.reattaching;
  this.reattaching = (async () => {
    // 不传递 clientId，以便 bridge 发起新的注册，而不是验证过期的那个。显式传递 workspaceCwd：restoreSession 在现有条目快速路径之前调用 resolveWorkspaceKey(req.workspaceCwd)，该辅助函数在非绝对路径或未定义路径时会抛出异常。
    const { clientId } = await this.client.resumeSession(
      this.sessionId,
      { workspaceCwd: this.workspaceCwd },
      undefined,
    );
    this.session.clientId = clientId; // 仅刷新 clientId；保持 SSE 游标 (lastSeenEventId) 和状态不变
  })();
  try {
    await this.reattaching;
  } finally {
    this.reattaching = undefined;
  }
}
```

`this.session` 是一个浅拷贝，并且 `DaemonSession.clientId` 不是 `readonly`，因此就地修改是有效的。使用 `resume`（而不是 `load`）是因为我们只需要重新注册，而不需要重放历史记录。

### 3. `withClientIdSelfHeal<T>(fn): Promise<T>`

```ts
private async withClientIdSelfHeal<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isInvalidClientId(err)) throw err; // 非 invalid_client_id：向上抛出
    await this.reattach();                  // 可能抛出异常 → 向上抛出
    return await fn();                      // 仅重试一次；如果再次抛出异常（包括 invalid_client_id），则向上抛出——无循环
  }
}
```

### 4. 接入 `prompt()`

仅包装两条路径上的 admission 网络调用；将 `reservePromptSlot`/`releaseAdmission` 保持在包装器外部，以便本地 slot 只被保留一次并在重试期间重用：

- 阻塞路径（`!this.subscriptionActive`）：
  `return await this.withClientIdSelfHeal(() => this.client.prompt(this.sessionId, req, signal, this.clientId));`
- 非阻塞路径：
  `accepted = await this.withClientIdSelfHeal(() => this.client.promptNonBlocking(this.sessionId, req, signal, this.clientId));`

`this.clientId` 在闭包**内部**读取，因此重试会获取刷新后的 id。admission 之后的所有内容（`_pendingPrompts` 注册和通过 `promptId` 匹配 SSE turn 事件）保持不变；SSE 订阅以 `sessionId` 为键，因此它能在 `clientId` 更改后继续存活。

## 错误处理

- 非 `invalid_client_id` 错误（例如 `500`、`SessionNotFoundError`、`DaemonPendingPromptLimitError`）：立即向上抛出，不进行 `reattach`。
- `reattach()` 失败（session 确实已丢失、网络问题）：向上抛出——用户会看到真实的错误，而不是卡死。
- 重试耗尽（重试也返回 `invalid_client_id`）：向上抛出；限制为一次重试，无循环。
- `AbortSignal`：被包装的 `prompt`/`promptNonBlocking` 在入口处调用 `throwIfAborted()`，因此在 abort 后的重试会抛出 `AbortError`。（`resumeSession` 没有 signal 参数；正在执行的 `reattach` 不可 abort——这是可以接受的，因为它是一个短暂的单次调用。）

## 已知限制

- **罕见的单独驱逐边缘情况：** 如果在 session 在内存中保持存活时 `clientId` 被驱逐（泄漏撤销 / `client_evicted`），`reattach()` 会增加一个额外的 attach（`attachCount++`），而没有匹配的 `/detach`。因为 `close()` 是全部销毁，唯一的泄漏窗口是 session 在没有显式 `close()` 的情况下被废弃，然后由于卡住的 `attachCount`（限制为一个 session）而无法被 idle-GC 回收。实际发生的事故是 daemon 重启的情况，这是干净的。已记录而非通过工程手段规避。

## 测试 (TDD)

使用 `packages/sdk-typescript/test/unit/DaemonSessionClient.test.ts` 中现有的 `recordingFetch` 测试工具，通过真实的 `DaemonClient` 按 URL 进行拦截（测试真实的 `failOnError` → `DaemonHttpError` 映射）。

1. **非阻塞自愈：** 第一次 `POST /session/s-1/prompt` → `400 {code:'invalid_client_id'}`；`POST /session/s-1/resume` → 新的 `clientId: 'client-2'`；第二次 prompt → `202`。断言：prompt 成功 resolve，第二次 prompt 请求携带 `x-qwen-client-id: client-2`，resume 被调用一次。
2. **阻塞自愈**（`subscriptionActive` 为 false）：同上，通过阻塞的 `prompt` 路径（重试时返回 `200`/`202` + turn-complete）。
3. **重试有界：** prompt → 两次 `400 invalid_client_id` → 错误向上抛出（断言 resume 被调用一次，错误为 `DaemonHttpError` invalid_client_id）。
4. **非 invalid 错误不重试：** prompt → `500` → 立即向上抛出，**绝不**调用 `resume`。
5. **reattach 失败向上抛出：** prompt → `400 invalid_client_id`；resume → `404`/`500` → 该错误向上抛出。
6. **Single-flight：** 两个并发的 `prompt()` 调用都收到 `400 invalid_client_id` → `resume` 恰好被调用一次；两次重试都使用新的 id。