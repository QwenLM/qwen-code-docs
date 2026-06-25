# Session Idle Reaper — 设计文档

**状态：** 草稿  
**作者：** qinqi  
**日期：** 2026-06-08  
**范围：** `packages/acp-bridge/src/bridge.ts`、`packages/cli/src/serve/server.ts`

---

## 1. 问题陈述

### 1.1 当前行为

Bridge session 一旦创建，就会永久驻留在内存（`byId: Map<string, SessionEntry>`）中。它仅在以下情况下被销毁：

1. 客户端显式调用 `DELETE /session/:id`（`closeSession`）
2. 共享的 `qwen --acp` 子进程崩溃（`channel.exited` 处理器）
3. daemon 进程收到 `SIGTERM` / `SIGINT`（`shutdown`）

Session **没有自动的空闲超时**机制。心跳时间戳（`sessionLastSeenAt`、`clientLastSeenAt`）由 `recordHeartbeat` 记录，但从未用于驱逐（字段注释中提到了未来的"撤销策略（PR 24）"，目前尚未落地）。

### 1.2 影响

| 场景 | 症状 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 用户打开多个浏览器标签页，关闭时未调用 `DELETE /session` | Session 在 `byId` 中不断积累，每个持有一个 EventBus ring（约 2-4 MB）|
| 20 个 session（默认 `maxSessions`）积累 | 新的 `spawnOrAttach` 触发 `SessionLimitExceededError`——用户被锁定 |
| 长时间运行的 daemon 伴随标签页频繁开关 | EventBus replay ring 和 ACP 侧 session 状态的内存无限增长 |
| IDE 扩展重启/崩溃 | 孤立的 session 永远无法被清理 |

### 1.3 为什么现在

Daemon 越来越多地作为长时间运行的工作区服务器使用（桌面应用、IDE 扩展、Web UI）。客户端崩溃和网络抖动是常见情况——依赖显式 `DELETE` 来清理是不可行的。

---

## 2. 设计目标

1. **自动回收空闲 session**——客户端已离线且没有正在进行的活跃工作。
2. **永不销毁有活跃 prompt 的 session**——这样做会静默终止用户可见的工作。
3. **保留持久化的 session 数据**——仅释放内存中的 bridge 状态；磁盘记录（`SessionService`）不受影响。用户可通过 `session/load` 或 `session/resume` 恢复。
4. **可观测**——发出明确的 SSE 事件，让客户端知道 session 关闭的原因（空闲超时 vs. 显式关闭 vs. 崩溃）。
5. **可配置**——运维人员和测试可以调整超时时间或完全禁用 reaper。
6. **零新依赖/组件**——完全在现有 bridge 闭包内实现。

### 非目标

- 跨工作区的 session 管理（这属于 gateway 层面的问题）。
- `maxSessions` 边界处的 LRU 驱逐（有价值但属于独立工作——已作为后续任务跟踪）。
- 空闲 session 的 EventBus ring 压缩（在 20 个 session 上限下优先级较低；已作为后续任务跟踪）。
- 基于 RSS 的自适应内存压力（需要 `process.memoryUsage()` 轮询和策略设计；已作为后续任务跟踪）。

---

## 3. 架构

### 3.1 概览

```
Bridge closure (createHttpAcpBridge)
│
├─ byId: Map<sessionId, SessionEntry>     ← 现有
├─ channelInfo: ChannelInfo               ← 现有
├─ idleTimer (channel-level)              ← 现有
│
└─ sessionReaper: NodeJS.Timeout          ← 新增
     │
     ├─ 每隔 REAP_INTERVAL_MS 扫描 byId
     ├─ 跳过有活跃 prompt 的 session
     ├─ 跳过有存活 SSE 订阅者的 session
     ├─ 关闭超过空闲 TTL 的 session
     └─ 发出 session_closed { reason: 'idle_timeout' }
```

### 3.2 与现有机制的关系

| 机制 | 范围 | 管理内容 |
| ----------------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `channelIdleTimeoutMs` + `startIdleTimer` | Channel（子进程） | 当所有 session 都消失时，终止 `qwen --acp` 子进程 |
| **Session reaper**（本设计） | Session（内存条目） | 在 session 空闲时关闭单个 session |
| `ConnectionRegistry` sweep | ACP-over-HTTP 连接 | 回收 `/acp` 传输层连接（不同层） |
| `writerIdleTimeoutMs` | SSE 订阅者 | 驱逐单个卡住的 SSE 订阅者 |
| Disconnect reaper（server.ts） | Spawn 握手 | 回收在 `POST /session` 握手期间 spawn 所有者断开连接的 session |

两种机制协同覆盖 session 生命周期清理：

1. **Close-on-last-detach**（主要路径）——当 `detachClient` 移除最后一个已注册客户端且没有 SSE 订阅者时，立即通过 `closeSessionImpl` 关闭 session。这处理正常路径：用户关闭标签页 → React 清理 → `POST /session/:id/detach`。

2. **Session idle reaper**（兜底路径）——定期扫描没有活跃 prompt、没有 SSE 订阅者且在配置的 TTL 内未收到心跳的 session。这捕获崩溃路径：浏览器被强制终止、网络断开、`kill -9`——detach 请求从未发出，因此 `clientIds` 仍显示已注册的客户端，但 session 实际上已成为孤儿。

---

## 4. 详细设计

### 4.1 新配置选项（`BridgeOptions`）

```typescript
interface BridgeOptions {
  // ... 现有字段 ...

  /**
   * session reaper 扫描 `byId` 中空闲 session 的频率，单位毫秒。
   * 默认值：60_000（1 分钟）。设为 0 或 Infinity 可完全禁用 reaper。
   * 计时器会调用 `.unref()`。
   */
  sessionReapIntervalMs?: number;

  /**
   * 一个没有存活 SSE 订阅者且没有已注册客户端的 session，
   * 若在此毫秒数内未收到心跳，则视为空闲并将被回收。
   *
   * 默认值：30 * 60_000（30 分钟）。
   * 设为 0 或 Infinity 可禁用空闲回收。
   */
  sessionIdleTimeoutMs?: number;
}
```

**CLI 参数**（`qwen serve` flags）：

```
--session-reap-interval-ms <ms>   Reaper 扫描间隔（默认 60000，0=禁用）
--session-idle-timeout-ms <ms>    空闲阈值（默认 1800000，0=禁用）
```

### 4.2 Session 空闲判断条件

当以下**所有**条件成立时，session 可被回收：

1. **没有活跃 prompt**：`entry.promptActive === false`
2. **没有存活 SSE 订阅者**：`entry.events.subscriberCount === 0`
3. **超过空闲时长**：`now - lastActivity(entry) > sessionIdleTimeoutMs`

注意：reaper 有意**不**检查 `clientIds.size`。它覆盖 detach 请求从未发出的崩溃路径——`clientIds` 仍显示已注册的客户端，但 session 实际上已成为孤儿。正常路径（客户端发送 detach）由 close-on-last-detach 处理。

其中 `lastActivity(entry)` 定义如下：

```typescript
function lastActivity(entry: SessionEntry): number {
  // `sessionLastSeenAt` 是 epoch-ms（来自 Date.now()）；
  // `createdAt` 是 ISO 8601 字符串——解析为 epoch-ms 作为兜底。
  return entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
}
```

注意：`entry.createdAt` 的类型是 `string`（ISO 8601），而非数字。
`Date.parse` 在此处是安全的——格式始终为 `new Date().toISOString()`
（参见 `createSessionEntry`，bridge.ts:1883）。

**每项保护的原因：**

| 保护条件 | 原因 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 没有活跃 prompt | 无头/自动化 prompt（如 CLI pipe、cron 任务）可能在没有 SSE 订阅者的情况下运行。回收它会终止正在进行的工作。|
| 没有 SSE 订阅者 | 有客户端正在主动监听。即使它没有发送心跳，SSE 连接本身也能证明其存活。|
| 空闲时长 | 宽限期，让短暂断线的客户端可以重新连接而不丢失 session。|

### 4.3 回收操作

对于每个通过空闲判断的 session，reaper 调用：

```typescript
await closeSession(sessionId, { reason: 'idle_timeout' });
```

这复用了现有的 `closeSession` 路径，该路径会：

1. 从 `byId` / `defaultEntry` 中移除
2. 通过 `permissionMediator.forgetSession` 取消待处理的权限
3. 发布 `session_closed` 事件（带 `reason: 'idle_timeout'`）
4. 关闭 EventBus
5. 向 ACP 子进程发送 `connection.cancel()`（尽力而为）
6. 如果这是最后一个 session，在 channel 上触发 `startIdleTimer`

**为什么用 `closeSession` 而不是 `killSession`？**

`killSession` 是为 spawn 握手断开连接竞争设计的内部强制回收路径（`requireZeroAttaches` 守卫、`spawnOwnerWantedKill` 墓碑）。`closeSession` 是文档化的面向客户端路径，会发布 `session_closed`（而非 `session_died`）并正确处理遥测。Reaper 是"代替缺席客户端进行优雅关闭"，因此 `closeSession` 是正确的语义选择。

### 4.4 扩展 `closeSession` 以接受关闭原因

目前 `closeSession` 在 `session_closed` 事件中硬编码了 `reason: 'client_close'`。我们需要将其参数化。

**方案：** 为 `closeSession` 添加新的可选 `opts` 参数，而非重载 `BridgeClientRequestContext`（后者是客户端请求范围的类型——将 `reason` 添加到其中会造成层违规，因为"原因"是服务端决策，而非客户端通过 header 传入的内容）。

```typescript
// bridgeTypes.ts — 新类型 + 签名变更：
export interface CloseSessionOpts {
  /** 覆盖 session_closed 事件中默认的 'client_close' 原因。*/
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

现有调用者（`DELETE /session/:id` 路由）不传 `opts`，默认使用 `'client_close'`。Reaper 传入 `{ reason: 'idle_timeout' }`。

### 4.5 Reaper 生命周期

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
      // 传入 `undefined` context（无客户端）和 `{ reason }` opts。
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

注意：`bridgeImpl` 指的是 `createHttpAcpBridge` 返回的 bridge 对象，以便 `closeSession` 能访问闭包内的状态。实践中，这直接调用闭包内部的 `closeSessionImpl` 函数。

**生命周期集成：**

- `startSessionReaper()` 在 bridge 构建时调用（选项验证后，与现有 `channelIdleTimeoutMs` 设置并列）。
- `stopSessionReaper()` 在 `shutdown()` 和 `killAllSync()` 中均被调用。

### 4.6 与现有 `closeSession` 调用方的交互

| 调用方 | 影响 |
| ---------------------------- | ------------------------------------------------------------------ |
| `DELETE /session/:id` 路由 | 无——不传 `opts`，默认 `reason: 'client_close'` |
| Session reaper（本设计） | 传入 `opts: { reason: 'idle_timeout' }` |
| `detachClient` 延迟回收 | 调用 `killSession`（非 `closeSession`），不受影响 |
| `channel.exited` 处理器 | 发布 `session_died`，不受影响 |
| `shutdown()` | 以 `daemon_shutdown` 为原因发布 `session_died`，不受影响 |

### 4.7 并发安全性

Reaper 回调在 Node.js 事件循环上运行。关键注意事项：

- **`for...of` 迭代是同步的。** Reaper 同步评估每个条目的空闲判断条件，然后对匹配的条目触发 `closeSession(...).catch(...)`。循环体内没有 `await`——所有关闭操作在单个微任务边界内分发，之后循环退出。
- **`byId.delete` 是延迟的。** 在 `closeSession` 内部，`byId.delete` 在第一个 `await`（`notifyAgentSessionClose`）之后运行。这意味着删除发生在 `for...of` 循环完成后的微任务中。由于每个 `closeSession` 操作于不同的 key，不存在别名问题。且 `for...of` 已完成迭代，因此迭代过程中的删除不是问题。
- **双重关闭竞争。** 如果客户端在 reaper 的判断检查和异步 `closeSession` 执行之间调用 `DELETE /session/:id`，reaper 的 `closeSession` 将抛出 `SessionNotFoundError`（被 `.catch()` 捕获）。安全。
- **重连竞争。** 如果客户端在 reaper 的判断检查和 `closeSession` 执行之间重新连接到 session（注册 clientId/打开 SSE），`closeSession` 仍会继续关闭该 session。客户端收到 `session_closed` 后必须重新加载。这个窗口极为短暂（一个同步的 `setInterval` tick），后果是良性的——不会丢失数据，只是需要重新加载。30 分钟的默认 TTL 使这种情况极为罕见。
- 扫描期间，并发的 `spawnOrAttach` 创建的新 session 不会被看到（我们在每次 tick 开始时迭代 `byId` 条目）。这是安全的——新 session 是新创建的，不会满足空闲阈值。

### 4.8 Wire 格式变更

`session_closed` 事件的 `data.reason` 字段已存在，值为 `'client_close'`。我们新增两个值：

- `'idle_timeout'`——由 idle reaper 发出（崩溃客户端的兜底路径）
- `'last_client_detached'`——由 close-on-last-detach 发出（正常标签页关闭）

这是向后兼容的——现有检查 `reason === 'client_close'` 的 SDK 代码将简单地不匹配新值，而通用终端帧处理器（`isTerminalLifecycleEvent`）已经无论原因如何都处理 `session_closed`。

---

## 5. 测试计划

### 5.1 单元测试（`bridge.test.ts`）

| # | 测试 | 描述 |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | 空闲 session 在超时后被回收 | 创建一个 session，将时间推进到超过 `sessionIdleTimeoutMs`，触发 reaper tick，验证 session 已从 `byId` 移除且 `session_closed` 事件以 `reason: 'idle_timeout'` 发布 |
| 2 | 有活跃 prompt 的 session 不被回收 | 创建一个 session，启动 prompt，推进时间，验证 session 在 reaper tick 后存活 |
| 3 | 有存活 SSE 订阅者的 session 不被回收 | 创建一个 session，订阅其 EventBus，推进时间，验证 session 存活 |
| 4 | 有已注册客户端的 session 不被回收 | 创建一个 session，注册一个 clientId，推进时间，验证 session 存活 |
| 5 | 当 interval = 0 时禁用 reaper | 传入 `sessionReapIntervalMs: 0`，验证未设置 `setInterval` |
| 6 | 当 timeout = 0 时禁用 reaper | 传入 `sessionIdleTimeoutMs: 0`，验证未设置 `setInterval` |
| 7 | shutdown 时停止 reaper | 调用 `shutdown()`，验证 `clearInterval` 被调用 |
| 8 | closeSession reason 默认为 'client_close' | 调用 `closeSession` 时不传显式 reason，验证发布的事件有 `reason: 'client_close'` |
| 9 | closeSession 带显式 reason | 以 `reason: 'idle_timeout'` 调用 `closeSession`，验证发布的事件 |
| 10 | 单次 tick 中回收多个空闲 session | 创建 3 个空闲 session，推进时间，触发 tick，验证全部 3 个被回收 |
| 11 | 心跳在 TTL 内的 session 存活 | 创建一个 session，记录心跳，将时间推进到刚好低于 TTL，验证 session 存活 |
| 12 | 最后一个 session 被回收后触发 channel 空闲计时器 | 创建 1 个 session（channel 上的最后一个），回收它，验证 channel 上调用了 `startIdleTimer` |

### 5.2 集成测试（`server.test.ts`）

| # | 测试 | 描述 |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1 | `GET /health?deep=1` 反映 reaper 清理后的 session 数量 | 启动 daemon，创建 session，推进时间，验证 health 端点显示减少的数量 |
| 2 | SSE 订阅者收到 `reason: 'idle_timeout'` 的 `session_closed` | 打开 SSE，断开连接，在 TTL 前重新连接，然后让 TTL 过期，验证事件 |

---

## 6. 配置默认值

| 选项 | 默认值 | 原因 |
| ----------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `sessionReapIntervalMs` | 60,000（1 分钟） | 足够频繁以防止长时间积累，且成本低廉（简单的 Map 扫描）可以频繁运行 |
| `sessionIdleTimeoutMs` | 1,800,000（30 分钟） | 充裕的重连宽限期。与 `ConnectionRegistry.idleTtlMs` 保持一致，便于心智模型统一 |

---

## 7. 可观测性

- **stderr 日志**：每次回收时输出 `qwen serve: reaping idle session "<id>" (idle for Nms)`，遵循现有的 `qwen serve:` 前缀约定。
- **遥测事件**：`session.close`，操作为 `qwen-code.daemon.bridge.operation: 'session.close'`（复用现有 `closeSession` 遥测路径）。
- **遥测指标**：`sessionLifecycle('close')`（复用现有计数器）。
- **SSE 事件**：`session_closed`，带 `data.reason: 'idle_timeout'`。

---

## 8. 后续工作（超出范围）

| 项目 | 描述 | 优先级 |
| ------------------------------- | ------------------------------------------------------------------------------- | -------- |
| `maxSessions` 边界处的 LRU 驱逐 | 不拒绝新 session，而是驱逐最近最少活跃的空闲 session | P1 |
| EventBus ring 压缩 | 对 0 个订阅者的 session 缩减 ring 以节省内存 | P2 |
| 基于 RSS 的自适应内存压力 | 监控 `process.memoryUsage().rss`，在内存紧张时降低空闲 TTL | P2 |
| 基于心跳的客户端存活检测 | 自动注销连续错过 N 个心跳窗口的客户端 | P2 |

---

## 9. 风险与缓解措施

| 风险 | 缓解措施 |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reaper 关闭了无头客户端即将重新连接的 session | 30 分钟默认 TTL 已很充裕；无头客户端应发送心跳。磁盘记录已保留——`session/load` 可恢复。|
| Reaper 内的 `closeSession` 抛出异常，污染扫描循环 | 每个关闭操作都有独立的 `.catch()`——一个失败不会阻塞其他操作 |
| 另一路径的并发 `closeSession` 期间 reaper 迭代 `byId` | ES2015 Map 迭代可容忍当前/前序 key 的删除。双重关闭是幂等的（`byId.get` 返回 undefined → `SessionNotFoundError` 被 reaper 的 `.catch` 捕获）。|
| 每 60 秒扫描 20 个 session 的性能 | 微不足道——每次 20 个 Map 读取 + 4 个字段检查。无 I/O。|
| Channel 空闲计时器交互 | 当最后一个 session 被回收时，`closeSession` 已在 channel 上调用 `startIdleTimer`。无需额外逻辑。|
