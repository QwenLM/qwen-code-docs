# 设计：针对 `invalid_client_id` 的 clientId 自愈 (DaemonSessionClient)

- **日期:** 2026-06-24
- **组件:** `packages/sdk-typescript` — `DaemonSessionClient`
- **依赖:** PR #5784 (`fix(daemon): Reject stale prompt client admission`) — **已合并** (`84745d0f0`)
- **状态:** 已实现（建立在已合并的 #5784 基础上）

## 问题

daemon 重启（或 session 重载）后，daemon 内存中的客户端注册信息会被清空。前端如果仍持有旧的服务器分配的 `clientId`，在发送 `POST /session/:id/prompt` 时会带上这个过时的 id。bridge 的 `resolveTrustedClientId` 无法识别该 id，从而拒绝该 prompt，并抛出 `InvalidClientIdError`。

实际生产事故（trace `a76a31fe…`，daemon 日志 15:24）：prompt 由 `client_d019b847` 发送，但 session 已（重新）加载为另一个 id `client_ac36fac9`，因此发送 prompt 的客户端从未被注册。UI 一直停留在“处理中”，因为该失败从未被作为一次终端 turn 事件暴露出来。

PR #5784 修复了*暴露*这一半：现在 `invalid_client_id` 在**准入阶段**就会抛出，因此 `POST /session/:id/prompt` 会同步返回 `400 invalid_client_id`（无 `promptId`），而不是 `202` 然后异步静默失败。本设计增加了*自愈*这一半：当 SDK 收到该 `400` 时，它会重新注册以获取新的 `clientId`，然后重试该 prompt 一次，从而让 turn 继续执行，无需用户手动重发。

## 范围

在范围之内（仅 SDK，`DaemonSessionClient`）：

- 在 prompt 准入调用时检测 `invalid_client_id`。
- 针对（已恢复的）session 重新注册客户端，以获取新的服务器分配的 `clientId`。
- 使用新的 `clientId` **重试一次** prompt。

明确不在范围之内（YAGNI）：

- SSE 流重连——仍由应用层负责（dataworks 应用已有 `reloadSession`/重连逻辑）。`invalid_client_id` 仅出现在准入调用上，绝不会出现在 SSE 等待中。
- 其他携带 `clientId` 的方法（`btw`、`shell`、turn 中间的消息、`cancel`、`heartbeat`）的自愈。仅 `prompt()` 会自愈。
- 在 daemon 重启后持久化 `clientId`。

## 关键不变量（已根据源代码验证）

1. **重试是安全的，因为 `invalid_client_id` 是准入时的拒绝。** `resolveTrustedClientId` 在 bridge 的 `sendPrompt` 内部运行，早于 turn 的注册和路由发出 `202` 之前。在 PR #5784 中，这会同步抛出 → 在接受前返回 `400` → prompt **从未被执行**。因此重试不可能导致用户消息被重复执行。这一不变量是整个重试安全的基础；它依赖于 #5784。

2. **`registerClient` 从不抛出，且总是返回有效的 id。** 对于未知的 `requestedClientId`，它会退回到 `createClientId()` 并返回一个全新的 `client_<uuid>`。只有 `resolveTrustedClientId`（被 prompt/cancel/… 使用）会抛出。因此 `load`/`resume` 调用总是返回一个可用的 `clientId`。

3. **restore 响应始终携带已注册的 `clientId`。** 现有条目的快速路径和冷恢复路径都会在响应中设置 `clientId: registerClient(entry, req.clientId)`。（在 `types.ts` 中关于“仅当调用者提供了 clientId 时才回显”的注释适用于 `HeartbeatResult`，而非 restore。）

4. **重启场景中不存在 net attach 泄漏，且 `close()` 的正确性得到提升。** `resumeSession` 会执行 `attachCount++`。引用计数的递减通过 `/detach` → `detachClient`（`attachCount--` + `unregisterClient`）完成。`close()` → `DELETE /session/:id` → `closeSessionImpl` 是**销毁全部**：它通过 `resolveTrustedClientId` 验证 clientId，然后拆除 session（`byId.delete`），连同 `attachCount` 一并丢弃。daemon 重启会清除重启前的 attach；`reattach()` 恰好建立一个 attach，后续 `close()`/重启会完全清除——不存在 net 泄漏。注意 `closeSessionImpl` 也会验证 clientId，因此在此更改之前，重启后使用过期 id 的 `close()` 本身会抛出 `InvalidClientIdError`；在 prompt 触发的 `reattach()` 之后，`this.clientId` 有效，因此 `close()` 成功。（`close()` 本身不自愈——不在范围之内——但间接受益。）

5. **该更改在 PR #5784 不存在时是惰性的。** 在 #5784 之前的 daemon 返回 `202` 然后异步失败，绝不会返回 `400 invalid_client_id`，因此谓词永不为真，自愈不会触发。无影响的无害操作。

## 设计

所有更改都限于 `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`。

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

### 2. `reattach(): Promise<void>` — 单飞（single-flight）

```ts
private reattaching?: Promise<void>;

private async reattach(): Promise<void> {
  // Coalesce concurrent prompts that all observed invalid_client_id so we
  // re-register exactly once (avoids orphaning extra clientIds / attachCount).
  if (this.reattaching) return this.reattaching;
  this.reattaching = (async () => {
    // Pass no clientId so the bridge issues a fresh registration instead of
    // validating the stale one. Pass workspaceCwd explicitly: restoreSession
    // calls resolveWorkspaceKey(req.workspaceCwd) before the existing-entry
    // fast path, and that helper throws on a non-absolute/undefined path.
    const { clientId } = await this.client.resumeSession(
      this.sessionId,
      { workspaceCwd: this.workspaceCwd },
      undefined,
    );
    this.session.clientId = clientId; // only refresh clientId; leave the SSE
                                      // cursor (lastSeenEventId) and state alone
  })();
  try {
    await this.reattaching;
  } finally {
    this.reattaching = undefined;
  }
}
```

`this.session` 是浅拷贝，且 `DaemonSession.clientId` 不是 `readonly`，因此原地修改是有效的。使用 `resume`（而非 `load`）是因为我们只需要重新注册，不需要回放历史。

### 3. `withClientIdSelfHeal<T>(fn): Promise<T>`

```ts
private async withClientIdSelfHeal<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isInvalidClientId(err)) throw err; // non-invalid_client_id: propagate
    await this.reattach();                  // may throw → propagate
    return await fn();                      // retry exactly once; if it throws
                                            // again (incl. invalid_client_id),
                                            // propagate — no loop
  }
}
```

### 4. 接入 `prompt()`

仅在准入网络调用上包裹两个路径；将 `reservePromptSlot`/`releaseAdmission` 保留在 wrapper 之外，以便本地 slot 只预留一次，并在重试时复用：

- 阻塞路径（`!this.subscriptionActive`）:
  `return await this.withClientIdSelfHeal(() => this.client.prompt(this.sessionId, req, signal, this.clientId));`
- 非阻塞路径：
  `accepted = await this.withClientIdSelfHeal(() => this.client.promptNonBlocking(this.sessionId, req, signal, this.clientId));`

`this.clientId` 在闭包**内部**读取，以便重试时获取刷新后的 id。准入之后的所有操作（`_pendingPrompts` 注册和通过 `promptId` 匹配 SSE turn 事件）保持不变；SSE 订阅以 `sessionId` 为键，因此能经受住 `clientId` 的变更。

## 错误处理

- 非 `invalid_client_id` 错误（如 `500`、`SessionNotFoundError`、`DaemonPendingPromptLimitError`）：立即传播，不触发 `reattach`。
- `reattach()` 失败（session 真正消失、网络问题）：传播——用户会看到真实的错误，而不是挂起。
- 重试耗尽（重试仍然返回 `invalid_client_id`）：传播；只重试一次，无循环。
- `AbortSignal`：被包裹的 `prompt`/`promptNonBlocking` 调用在入口处执行 `throwIfAborted()`，因此重试如果在 abort 之后进行会抛出 `AbortError`。（`resumeSession` 没有 signal 参数；正在进行的 `reattach` 不可 abort——这是可接受的，它只是单个短调用。）

## 已知限制

- **罕见的独立驱逐边界情况：** 如果某个 `clientId` 在 session 仍存于内存时被驱逐（leak-revocation / `client_evicted`），`reattach()` 会增加一个额外的 attach（`attachCount++`），但不会有对应的 `/detach`。由于 `close()` 是销毁全部，唯一的泄漏窗口是一个被放弃且没有显式 `close()` 的 session，并且它被卡住的 `attachCount`（限于一个 session）阻止了空闲 GC。实际事故是 daemon 重启场景，那是干净的。文档记录而非工程处理。

## 测试 (TDD)

使用 `packages/sdk-typescript/test/unit/DaemonSessionClient.test.ts` 中现有的 `recordingFetch` 测试工具，通过真实 `DaemonClient` 按 URL 拦截（会运行真实的 `failOnError` → `DaemonHttpError` 映射）。

1. **非阻塞自愈：** 第一次 `POST /session/s-1/prompt` → `400 {code:'invalid_client_id'}`；`POST /session/s-1/resume` → 新的 `clientId: 'client-2'`；第二次 prompt → `202`。断言：prompt 解析，第二次 prompt 请求携带 `x-qwen-client-id: client-2`，resume 调用一次。
2. **阻塞自愈**（`subscriptionActive` 为 false）：同上，通过阻塞的 `prompt` 路径（重试时返回 `200`/`202`+turn 完成）。
3. **重试受限：** prompt → 两次 `400 invalid_client_id` → 错误传播（断言 resume 调用一次，错误是 `DaemonHttpError` invalid_client_id）。
4. **非 invalid 错误不重试：** prompt → `500` → 立即传播，`resume` **从未**调用。
5. **reattach 失败传播：** prompt → `400 invalid_client_id`；resume → `404`/`500` → 该错误传播。
6. **单飞：** 两个并发的 `prompt()` 调用都得到 `400 invalid_client_id` → `resume` 恰好调用一次；两个重试都使用新的 id。