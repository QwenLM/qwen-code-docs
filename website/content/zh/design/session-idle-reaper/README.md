# 会话空闲回收器 — 设计文档

**状态：** 草稿  
**作者：** qinqi  
**日期：** 2026-06-08  
**范围：** `packages/acp-bridge/src/bridge.ts`, `packages/cli/src/serve/server.ts`

---

## 1. 问题陈述

### 1.1 当前行为

一旦创建，桥接会话将无限期保存在内存中（`byId: Map<string, SessionEntry>`）。仅在以下情况下才会销毁：

1. 客户端显式调用 `DELETE /session/:id` (`closeSession`)
2. 共享的 `qwen --acp` 子进程崩溃（`channel.exited` 处理器）
3. 守护进程收到 `SIGTERM` / `SIGINT`（`shutdown`）

会话**没有自动空闲超时**。心跳时间戳（`sessionLastSeenAt`、`clientLastSeenAt`）由 `recordHeartbeat` 记录，但从未用于逐出（字段注释引用了尚未实现的未来“撤销策略（PR 24）”）。

### 1.2 影响

| 场景                                                                        | 症状                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 用户打开多个浏览器标签页，关闭时未调用 `DELETE /session`                     | 会话在 `byId` 中累积，每个会话持有一个 EventBus 环（约 2-4 MB）              |
| 累积 20 个会话（默认 `maxSessions`）                                        | 新的 `spawnOrAttach` 抛出 `SessionLimitExceededError` — 用户被锁定           |
| 长时间运行的守护进程配合标签页频繁开关                                      | EventBus 重放环和 ACP 端会话状态导致无界内存增长                             |
| IDE 扩展重启 / 崩溃                                                         | 孤儿会话永远无法清理                                                         |

### 1.3 为什么现在做

守护进程越来越多地被用作长期运行的工作区服务器（桌面应用、IDE 扩展、Web UI）。客户端崩溃和网络波动是常态——依赖显式的 `DELETE` 进行清理是不可行的。

---

## 2. 设计目标

1. **自动回收空闲会话**，其客户端已消失且没有进行中的活动工作。
2. **绝不销毁有活跃 prompt 的会话**——这样做会静默终止用户可见的工作。
3. **保留持久化会话数据**——仅释放内存中的桥接状态；磁盘上的记录（`SessionService`）不受影响。用户可以调用 `session/load` 或 `session/resume` 来恢复。
4. **可观测**——发出不同的 SSE 事件，以便客户端知道会话关闭的原因（空闲超时 vs. 显式关闭 vs. 崩溃）。
5. **可配置**——操作员和测试可以调整超时或完全禁用回收器。
6. **零新增依赖/组件**——完全在现有的桥接闭包中实现。

### 非目标

- 跨工作区会话管理（这属于网关层的关注点）。
- 在 `maxSessions` 边界进行 LRU 逐出（有价值但独立的工作——作为后续跟踪）。
- 空闲会话的 EventBus 环压缩（给定 20 会话上限，优先级低；作为后续跟踪）。
- 基于 RSS 的自适应压力（需要轮询 `process.memoryUsage()` 和策略设计；作为后续跟踪）。

---

## 3. 架构

### 3.1 概览

```
Bridge closure (createHttpAcpBridge)
│
├─ byId: Map<sessionId, SessionEntry>     ← 已有
├─ channelInfo: ChannelInfo               ← 已有
├─ idleTimer (channel-level)              ← 已有
│
└─ sessionReaper: NodeJS.Timeout          ← 新增
     │
     ├─ 每隔 REAP_INTERVAL_MS 扫描 byId
     ├─ 跳过有活跃 prompt 的会话
     ├─ 跳过有活跃 SSE 订阅者的会话
     ├─ 关闭超过空闲 TTL 的会话
     └─ 发出 session_closed { reason: 'idle_timeout' }
```

### 3.2 与现有机制的关系

| 机制                                    | 范围                     | 管理内容                                                                        |
| --------------------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `channelIdleTimeoutMs` + `startIdleTimer` | 通道（子进程）           | 当所有会话都消失时，杀死 `qwen --acp` 子进程                                    |
| **会话回收器**（本设计）                | 会话（内存条目）         | 空闲时关闭单个会话                                                              |
| `ConnectionRegistry` sweep              | ACP-over-HTTP 连接       | 回收 `/acp` 传输层连接（不同层）                                                |
| `writerIdleTimeoutMs`                   | SSE 订阅者               | 逐出一个卡住的 SSE 订阅者                                                       |
| 断开回收器（server.ts）                 | Spawn 握手               | 回收在 POST /session 握手期间其 spawn-owner 断开的会话                          |

两个机制协同工作，覆盖会话生命周期清理：

1. **最后分离时关闭**（主要）——当 `detachClient` 移除最后一个注册的客户端且没有 SSE 订阅者时，会话通过 `closeSessionImpl` 立即关闭。这处理正常路径：用户关闭标签页 → React 清理 → `POST /session/:id/detach`。

2. **会话空闲回收器**（兜底）——定期扫描没有活跃 prompt 且没有 SSE 订阅者、并且在配置的 TTL 内未收到心跳的会话。这捕获崩溃路径：浏览器被杀死、网络断开、`kill -9`——分离请求从未发送，因此 `clientIds` 仍然显示已注册的客户端，但会话实际上已被遗弃。

---

## 4. 详细设计

### 4.1 新的配置选项（`BridgeOptions`）

```typescript
interface BridgeOptions {
  // ... 已有字段 ...

  /**
   * 会话回收器扫描 `byId` 查找空闲会话的频率，单位毫秒。
   * 默认值：60_000（1 分钟）。设置为 0 或 Infinity 以完全禁用回收器。
   * 该定时器已 `.unref()`。
   */
  sessionReapIntervalMs?: number;

  /**
   * 一个既没有活跃 SSE 订阅者也没有注册客户端的会话，如果在该毫秒数内未收到心跳，
   * 则被视为空闲并会被回收。
   *
   * 默认值：30 * 60_000（30 分钟）。
   * 设置为 0 或 Infinity 以禁用空闲回收。
   */
  sessionIdleTimeoutMs?: number;
}
```

**CLI 层面**（`qwen serve` 标志）：

```
--session-reap-interval-ms <ms>   回收器扫描间隔（默认 60000，0=禁用）
--session-idle-timeout-ms <ms>    空闲阈值（默认 1800000，0=禁用）
```

### 4.2 会话空闲判定条件

一个会话在**所有**以下条件满足时才有资格被回收：

1. **无活跃 prompt**：`entry.promptActive === false`
2. **无活跃 SSE 订阅者**：`entry.events.subscriberCount === 0`
3. **空闲持续时间已超过**：`now - lastActivity(entry) > sessionIdleTimeoutMs`

注意：回收器有意**不检查** `clientIds.size`。它覆盖了从未发送 detach 的崩溃路径——`clientIds` 仍然显示已注册的客户端，但会话实际上已被遗弃。正常路径（客户端发送 detach）由 last-detach-close 机制处理。

其中 `lastActivity(entry)` 定义为：

```typescript
function lastActivity(entry: SessionEntry): number {
  // `sessionLastSeenAt` 是纪元毫秒（来自 Date.now()）；
  // `createdAt` 是 ISO 8601 字符串 — 作为 fallback 解析为纪元毫秒。
  return entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
}
```

注意：`entry.createdAt` 的类型是 `string`（ISO 8601），而不是数字。这里使用 `Date.parse` 是安全的——格式始终是 `new Date().toISOString()`（参见 `createSessionEntry`, bridge.ts:1883）。

**每个守卫的理由：**

| 守卫              | 原因                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 无活跃 prompt    | 某个无头/自主的 prompt（例如 CLI 管道、cron 作业）可能正在运行且没有 SSE 订阅者。回收它会杀死工作。                           |
| 无 SSE 订阅者 | 已连接的客户端正在积极监听。即使它没有发送心跳，SSE 连接本身也证明了活跃性。                                                  |
| 空闲持续时间      | 宽限期，使得短暂断开的客户端能在不丢失会话的情况下重新连接。                                                                  |

### 4.3 回收操作

对于每个通过空闲判定条件的会话，回收器调用：

```typescript
await closeSession(sessionId, { reason: 'idle_timeout' });
```

这会重用现有的 `closeSession` 路径，该路径：

1. 从 `byId` / `defaultEntry` 中移除
2. 通过 `permissionMediator.forgetSession` 取消待处理的权限
3. 发布 `session_closed` 事件（带 `reason: 'idle_timeout'`）
4. 关闭 EventBus
5. 向 ACP 子进程发送 `connection.cancel()`（尽力而为）
6. 如果这是最后一个会话，则触发通道上的 `startIdleTimer`

**为什么用 `closeSession` 而不是 `killSession`？**

`killSession` 是内部的强制回收路径，专为 spawn 握手断开竞争设计（`requireZeroAttaches` 守卫、`spawnOwnerWantedKill` 墓碑）。`closeSession` 是文档化的客户端面向路径，它发布 `session_closed`（而不是 `session_died`）并正确处理遥测。回收器是“代表缺席客户端的优雅关闭”，因此 `closeSession` 是合适的语义。

### 4.4 扩展 `closeSession` 以接收关闭原因

目前 `closeSession` 在 `session_closed` 事件中硬编码了 `reason: 'client_close'`。我们需要使其可参数化。

**方法：** 为 `closeSession` 添加一个新的可选参数 `opts`，而不是重载 `BridgeClientRequestContext`（这是一个客户端请求作用域的类型——将 `reason` 添加到其中会违反分层原则，因为“原因”是服务器端决策，而不是客户端在头部中传递的内容）。

```typescript
// bridgeTypes.ts — 新类型 + 签名变更：
export interface CloseSessionOpts {
  /** 覆盖 session_closed 事件中默认的 'client_close' 原因。 */
  reason?: string;
}

closeSession(
  sessionId: string,
  context?: BridgeClientRequestContext,
  opts?: CloseSessionOpts,
): Promise<void>;
```

```typescript
// bridge.ts — 实现变更：
async closeSession(sessionId, context, opts) {
  // ...
  const reason = opts?.reason ?? 'client_close';
  entry.events.publish({
    type: 'session_closed',
    data: { sessionId, reason, ... },
  });
}
```

现有的调用者（`DELETE /session/:id` 路由）不传递 `opts`，默认使用 `'client_close'`。回收器传递 `{ reason: 'idle_timeout' }`。

### 4.5 回收器生命周期

```typescript
// 在 createHttpAcpBridge 闭包内：

const resolvedReapIntervalMs = resolvePositiveMs(
  opts.sessionReapIntervalMs,
  60_000,
);
const resolvedIdleTimeoutMs = resolvePositiveMs(
  opts.sessionIdleTimeoutMs,
  30 * 60_000,
);

let sessionReaper: ReturnType<typeof setInterval> | undefined;

function startSessionReaper(): void {
  if (resolvedReapIntervalMs <= 0 || resolvedIdleTimeoutMs <= 0) return;
  sessionReaper = setInterval(() => {
    if (shuttingDown) return;
    const now = Date.now();
    for (const [id, entry] of byId) {
      if (entry.promptActive) continue;
      if (entry.events.subscriberCount > 0) continue;
      const lastActive = entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
      const idle = now - lastActive;
      if (idle < resolvedIdleTimeoutMs) continue;
      writeStderrLine(
        `qwen serve: reaping idle session ${JSON.stringify(id)} ` +
          `(idle for ${Math.round(idle / 1000)}s, threshold ${Math.round(resolvedIdleTimeoutMs / 1000)}s)`,
      );
      // 传递 `undefined` context（无客户端）和 `{ reason }` opts。
      bridgeImpl
        .closeSession(id, undefined, { reason: 'idle_timeout' })
        .catch((err) => {
          writeStderrLine(
            `qwen serve: session reaper failed to close ${JSON.stringify(id)}: ${String(err)}`,
          );
        });
    }
  }, resolvedReapIntervalMs);
  sessionReaper.unref();
}

function stopSessionReaper(): void {
  if (sessionReaper !== undefined) {
    clearInterval(sessionReaper);
    sessionReaper = undefined;
  }
}
```

注意：`bridgeImpl` 指向 `createHttpAcpBridge` 返回的桥接对象，因此 `closeSession` 可以完全访问闭包作用域的状态。在实践中，这是作为对闭包内部 `closeSessionImpl` 函数的直接调用来实现的。

**生命周期集成：**

- `startSessionReaper()` 在桥接构造时调用（在选项验证之后，与现有的 `channelIdleTimeoutMs` 设置一起）。
- `stopSessionReaper()` 在 `shutdown()` 和 `killAllSync()` 中都调用。

### 4.6 与现有 `closeSession` 调用者的交互

| 调用者                       | 影响                                                             |
| ---------------------------- | ---------------------------------------------------------------- |
| `DELETE /session/:id` 路由   | 无影响——未传递 `opts`，默认使用 `reason: 'client_close'`         |
| 会话回收器（本设计）         | 传递 `opts: { reason: 'idle_timeout' }`                          |
| `detachClient` 延迟回收      | 调用 `killSession`（不是 `closeSession`），不受影响              |
| `channel.exited` 处理器      | 发布 `session_died`，不受影响                                    |
| `shutdown()`                 | 发布带原因 `daemon_shutdown` 的 `session_died`，不受影响         |

### 4.7 并发安全性

回收器回调在 Node.js 事件循环上运行。关键考虑点：

- **`for...of` 迭代是同步的。** 回收器同步评估每个条目的空闲判定条件，然后对匹配的条目触发 `closeSession(...).catch(...)`。循环体中没有 `await`——所有关闭操作在单个微任务边界内发起，然后循环退出。
- **`byId.delete` 是延迟的。** 在 `closeSession` 内部，`byId.delete` 在第一个 `await`（`notifyAgentSessionClose`）之后运行。这意味着删除操作在 `for...of` 循环完成之后的微任务中发生。由于每个 `closeSession` 操作在不同的键上，因此不存在别名问题。而且 `for...of` 已经完成了迭代，所以中间迭代删除不是问题。
- **双重关闭竞争。** 如果客户端在回收器的判定检查与异步 `closeSession` 执行之间对同一个会话调用了 `DELETE /session/:id`，那么回收器的 `closeSession` 将抛出 `SessionNotFoundError`（由 `.catch()` 捕获）。安全。
- **重连竞争。** 如果客户端在回收器的判定检查与 `closeSession` 执行之间重新连接到会话（注册 clientId/打开 SSE），`closeSession` 仍会继续并关闭会话。客户端会收到 `session_closed` 并必须重新加载。这个窗口非常窄（一个同步的 `setInterval` tick），后果是良性的——没有数据丢失，只是一个重新加载的提示。30 分钟的默认 TTL 使这种情形极其罕见。
- 并发的 `spawnOrAttach` 在回收器扫描期间创建新会话不会被看到（我们在每个 tick 开始时迭代 `byId` 条目）。这是安全的——新会话是新鲜的，不会满足空闲阈值。

### 4.8 线上格式变更

`session_closed` 事件的 `data.reason` 字段已存在，值为 `'client_close'`。我们添加两个新值：

- `'idle_timeout'` — 由空闲回收器发出（崩溃客户端的兜底）
- `'last_client_detached'` — 由最后分离时关闭机制发出（正常关闭标签页）

这是向后兼容的——现有的检查 `reason === 'client_close'` 的 SDK 代码将不会匹配新值，而通用的终端帧处理器（`isTerminalLifecycleEvent`）已经处理了 `session_closed`，无论其原因如何。

---

## 5. 测试计划

### 5.1 单元测试（`bridge.test.ts`）

| #   | 测试                                                   | 描述                                                                                                                                                                            |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 空闲会话在超时后被回收                                 | 创建一个会话，将时间前进到超过 `sessionIdleTimeoutMs`，触发回收器 tick，验证会话已从 `byId` 中移除并发布了 `reason: 'idle_timeout'` 的 `session_closed` 事件                        |
| 2   | 有活跃 prompt 的会话不会被回收                         | 创建一个会话，启动一个 prompt，将时间前进，验证会话在回收器 tick 后仍存活                                                                                                       |
| 3   | 有活跃 SSE 订阅者的会话不会被回收                      | 创建一个会话，订阅其 EventBus，将时间前进，验证会话存活                                                                                                                         |
| 4   | 有注册客户端的会话不会被回收                           | 创建一个会话，注册一个 clientId，将时间前进，验证会话存活                                                                                                                       |
| 5   | 回收器在间隔为 0 时禁用                               | 传递 `sessionReapIntervalMs: 0`，验证没有 `setInterval` 被启动                                                                                                                   |
| 6   | 回收器在超时为 0 时禁用                               | 传递 `sessionIdleTimeoutMs: 0`，验证没有 `setInterval` 被启动                                                                                                                    |
| 7   | 回收器在关闭时停止                                     | 调用 `shutdown()`，验证 `clearInterval` 被调用                                                                                                                                  |
| 8   | closeSession 原因默认为 'client_close'                 | 调用 `closeSession` 而不显式传递原因，验证发布的事件带有 `reason: 'client_close'`                                                                                               |
| 9   | closeSession 带显式原因                                | 调用 `closeSession` 并传递 `reason: 'idle_timeout'`，验证发布的事件                                                                                                              |
| 10  | 多个空闲会话在一个 tick 中被回收                       | 创建 3 个空闲会话，将时间前进，触发 tick，验证所有 3 个都被回收                                                                                                                  |
| 11  | 在 TTL 内有心跳的会话存活                             | 创建一个会话，记录心跳，将时间前进到恰好低于 TTL，验证会话存活                                                                                                                   |
| 12  | 最后一个会话被回收后触发通道空闲定时器                 | 创建 1 个会话（通道上的最后一个），回收它，验证 `startIdleTimer` 在通道上被调用                                                                                                 |

### 5.2 集成测试（`server.test.ts`）

| #   | 测试                                                                   | 描述                                                                             |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | `GET /health?deep=1` 反映回收器清理后的会话计数                        | 启动守护进程，创建会话，将时间前进，验证健康端点显示减少的计数                    |
| 2   | SSE 订阅者收到 `reason: 'idle_timeout'` 的 `session_closed` 事件       | 打开 SSE，断开连接，在 TTL 前重新连接，然后让 TTL 过期，验证事件                  |
---

## 6. 配置默认值

| 选项                     | 默认值                    | 理由                                                                                                    |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `sessionReapIntervalMs`  | 60,000（1 分钟）          | 足够频繁以阻止长时间累积，且开销极低（简单的 Map 扫描）以支持频繁运行                                    |
| `sessionIdleTimeoutMs`   | 1,800,000（30 分钟）      | 为重新连接提供充足的宽限期。与 `ConnectionRegistry.idleTtlMs` 保持一致以维持心智模型的一致性                |

---

## 7. 可观测性

- **stderr 日志**：每次回收时输出 `qwen serve: reaping idle session "<id>" (idle for Nms)`，沿用已有的 `qwen serve:` 前缀约定。
- **遥测事件**：`session.close`，操作名为 `qwen-code.daemon.bridge.operation: 'session.close'`（复用现有的 `closeSession` 遥测路径）。
- **遥测指标**：`sessionLifecycle('close')`（复用现有的计数器）。
- **SSE 事件**：`session_closed`，携带 `data.reason: 'idle_timeout'`。

---

## 8. 后续工作（范围外）

| 事项                                  | 描述                                                                    | 优先级 |
| ------------------------------------- | ----------------------------------------------------------------------- | ------ |
| `maxSessions` 到达时的 LRU 淘汰         | 不拒绝新会话，而是淘汰最近最不活跃的空闲会话                               | P1     |
| EventBus 环形缓冲区压缩                | 对订阅者为 0 的会话缩小环形缓冲区以节省内存                                | P2     |
| 基于 RSS 的自适应压力                   | 监控 `process.memoryUsage().rss`，当内存紧张时降低空闲 TTL                | P2     |
| 基于心跳的客户端存活检测                 | 自动注销连续错过 N 个心跳窗口的客户端                                     | P2     |

---

## 9. 风险与缓解措施

| 风险                                                                          | 缓解措施                                                                                                                                                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 回收器关闭了一个无头客户端即将重新连接的会话                                     | 30 分钟的默认 TTL 是宽松的；无头客户端应发送心跳。磁盘中的转录被保留——`session/load` 可恢复它。                                                                          |
| 回收器内的 `closeSession` 抛出异常，污染扫描循环                                 | 每次关闭都在独立的 `.catch()` 中——一次失败不会阻塞其他关闭                                                                                                                |
| 回收器在对 `byId` 进行迭代时，另一个路径并发执行 `closeSession`                   | ES2015 Map 的迭代容忍删除当前或之前的键。重复关闭是幂等的（`byId.get` 返回 `undefined` → 由回收器的 `.catch` 捕获 `SessionNotFoundError`）。                                |
| 每 60 秒扫描 20 个会话的性能                                                     | 微不足道——20 次 Map 读取 + 4 个字段检查。无 I/O。                                                                                                                            |
| 通道空闲计时器交互                                                              | 当最后一个会话被回收时，`closeSession` 已在该通道上调用 `startIdleTimer`。无需额外逻辑。                                                                                     |