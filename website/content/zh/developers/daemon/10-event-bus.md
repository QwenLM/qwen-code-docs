# SSE Event Bus 与背压

## 概述

`EventBus` (`packages/acp-bridge/src/eventBus.ts`) 是每个会话的内存发布/订阅系统，为守护进程的 `GET /session/:id/events` SSE 路由提供数据。它为每个事件分配一个单调递增的 id，将最近的事件缓冲在一个有界环中以便通过 `Last-Event-ID` 进行重放，将发布的事件扇出到所有订阅者，应用每个订阅者的背压机制（在实时队列填充率/序列化字节填充率达到 75% 时发出警告，达到上限时进行驱逐），并发出订阅者本地的合成帧（`client_evicted`、`slow_client_warning`）。SDK 将这些合成帧视为一等事件，但总线会将其标记为**不带 `id`**，以免占用每个会话序列中的槽位。

`EventBus` 目前是 `acp-bridge` 的包私有模块，由 bridge 工厂通过每个会话的一个闭包实例来消费。未来的重构（在 `eventBus.ts` 的第 150-159 行有说明）将把它提升为顶级构建块，以便 channels、双输出和未来的 WebSocket 传输可以通过同一个总线进行订阅，而不是运行并行的流。

## 职责

- 分配从 1 开始的每个会话单调递增的事件 id。
- 缓冲最近的 `ringSize` 个事件，以便在带有 `lastEventId` 的订阅时进行重放。
- 将发布的事件扇出到最多 `maxSubscribers` 个并发订阅者。
- 应用每个订阅者的有界队列；使用合成的 `client_evicted` 终止帧丢弃溢出实时帧上限或实时序列化字节上限的订阅者。
- 在每次溢出事件中，当实时帧填充或实时序列化字节填充达到 75% 时发出一次 `slow_client_warning`，并带有 37.5% 的迟滞（hysteresis）以防止重复警告。
- 在 `AbortSignal.abort()` 时迅速拆除订阅。
- 在总线关闭时（例如会话拆除）干净地关闭每个订阅者。
- `publish` 永远不会抛出异常（契约是“调用 publish 始终是安全的”）。

## 架构

| 常量                                   | 值          | 用途                                                                                                 |
| -------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `EVENT_SCHEMA_VERSION`                 | `1`         | 印在每个 `BridgeEvent.v` 上；在发生破坏性帧更改时递增。                                              |
| `DEFAULT_RING_SIZE`                    | `8000`      | 每个会话的重放环。操作员可通过 `--event-ring-size` 覆盖。                                            |
| `DEFAULT_MAX_QUEUED`                   | `256`       | 每个订阅者的实时帧积压上限。                                                                         |
| `DEFAULT_MAX_QUEUED_BYTES`             | `2 MiB`     | 每个订阅者的实时序列化字节积压上限。                                                                 |
| `DEFAULT_MAX_SUBSCRIBERS`              | `64`        | 每个会话的订阅者上限。                                                                               |
| `WARN_THRESHOLD_RATIO`                 | `0.75`      | `slow_client_warning` 触发比例，基于 `maxQueued` 或 `maxQueuedBytes`。                               |
| `WARN_RESET_RATIO`                     | `0.375`     | 迟滞重新触发比例。                                                                                   |
| `MAX_EVENT_RING_SIZE` (在 `bridge.ts` 中) | `1_000_000` | `BridgeOptions.eventRingSize` 的软上限，用于捕获由拼写错误引起的内存不足故障。                       |

### `BridgeEvent`

```ts
interface BridgeEvent {
  id?: number; // 每个会话单调递增；在合成终止帧中缺失
  v: 1; // EVENT_SCHEMA_VERSION
  type: string; // 47 种已知类型之一或未来可扩展类型
  data: unknown; // 负载（由 SDK 按类型进行类型检查；请参阅 09-event-schema.md）
  _meta?: { serverTimestamp?: number; [key: string]: unknown }; // 由 EventBus.publish 打上时间戳
  originatorClientId?: string; // 当事件派生自带有 clientId 时间戳的请求时设置
}
```

### `SubscribeOptions`

```ts
interface SubscribeOptions {
  lastEventId?: number; // 从此 id 之后开始重放（Last-Event-ID 恢复）
  signal?: AbortSignal; // 迅速中止订阅
  maxQueued?: number; // 每个订阅者的实时帧积压上限；默认 256
}
```

`subscribe()` 返回一个 `AsyncIterable<BridgeEvent>`。SSE 路由使用 `for await` 消费它。注册是**同步的**——在 `subscribe()` 返回时，订阅者已经附加，因此与消费者的第一个 `next()` 竞争的 `publish()` 仍然会被传递。

实时字节上限是仅用于测试/嵌入式调用者的总线级构造函数选项。它不作为 HTTP 查询参数、SDK 选项、CLI 标志或功能暴露，因为客户端不能提高守护进程的内存预算。

### `BoundedAsyncQueue`

每个订阅者的队列。两个关键行为：

- **实时上限仅针对实时项。** 通过 `forcePush()` 插入的项在每个条目上带有 `forced: true` 标签，且永远不会计入 `liveCount` 或 `liveBytes`。这使得 `Last-Event-ID` 重放路径可以将数百个历史帧强制推送到新订阅者中，而不会立即触发实时上限并驱逐刚刚恢复的订阅者。
- **`liveCount` 和 `liveBytes` 作为字段维护**，而不是从 `forcedInBuf` 位置派生。当 `slow_client_warning` 开始在流中间强制推送时（警告进入队列的**末尾**，而不是像重放那样进入开头），早期基于位置的启发式方法失效了。每个条目的 `forced` 标签与位置无关；实时条目还存储其序列化字节估计值，因此排空队列会减少 `liveBytes`。
- **序列化字节是延迟估计的。** `push()` 仅在事件将被缓冲时计算 `Buffer.byteLength(JSON.stringify(event), 'utf8')`。如果订阅者已经在等待 `next()`，则直接传递事件，不计算字节估计值。如果序列化失败，守护进程会发出尽力而为的 stderr 诊断信息，并且该事件会跳过字节计算，同时保留 `publish()` 的不抛出异常契约；它仍然计入实时帧上限。

`push(value, getBytes)` 返回接受/拒绝结果，而不是阻塞或抛出异常。帧溢出会以 `queue_overflow` 拒绝；字节溢出会以 `queue_bytes_overflow` 拒绝。当实时队列为空时，允许单个超大事件，但其后的第二个实时事件会驱逐订阅者。`forcePush(value)` 绕过这两个上限。`close({drain?: boolean})` 默认排空挂起的项；中止路径传递 `drain: false` 以立即丢弃它们。

## 工作流

### 发布

```mermaid
flowchart TD
    P["publish({type, data, originatorClientId?})"] --> C{"总线已关闭？"}
    C -->|yes| RU["返回 undefined"]
    C -->|no| AID["分配 id = nextId++, v = 1"]
    AID --> PR["推送到环（如果 > ringSize 则移位）"]
    PR --> FAN["快照订阅者，对每个 sub："]
    FAN --> EVCK{"sub.evicted？"}
    EVCK -->|yes| NEXT[下一个订阅者]
    EVCK -->|no| PUSH["sub.queue.push(event, 延迟 getBytes)"]
    PUSH --> OK{"已接受？"}
    OK -->|no| EVICT["标记为已驱逐；强制推送 client_evicted；queue.close；sub.dispose"]
    OK -->|yes| RES{"已警告 && 帧/字节积压低于重置阈值？"}
    RES -->|yes| RA["warned = false（迟滞重新触发）"]
    RES -->|no| WARN{"未警告 && 达到帧/字节警告阈值？"}
    RA --> WARN
    WARN -->|yes| FW["记录 slow_client_warning；强制推送帧；warned = true"]
    WARN -->|no| NEXT
    FW --> NEXT
```

`publish` 永远不会抛出异常。在发布过程中关闭总线（关闭路径在等待 `channel.kill()` 之前关闭每个会话的总线）会返回 `undefined` 而不是抛出异常，因为代理可能在总线关闭和通道终止之间的小窗口内继续发出 `sessionUpdate` 通知。

### 订阅 + 重放（带环驱逐检测）

```mermaid
sequenceDiagram
    autonumber
    participant SR as SSE 路由
    participant EB as EventBus
    participant Q as BoundedAsyncQueue

    SR->>EB: subscribe({lastEventId: 42, maxQueued: 256, signal})
    EB->>EB: 如果 subs.size >= maxSubscribers 则拒绝<br/>（抛出 SubscriberLimitExceededError）
    EB->>Q: new BoundedAsyncQueue(maxQueued, maxQueuedBytes)
    EB->>EB: subs.add(sub)
    EB->>EB: epochReset = lastEventId >= nextId
    alt epochReset（旧总线纪元）
        EB->>Q: forcePush state_resync_required<br/>{ reason: 'epoch_reset', lastDeliveredId: 42, earliestAvailableId: ring[0]?.id ?? nextId }
        Note over EB,Q: 无 id 的合成帧，帧在重放之前。<br/>重放扫描整个当前环。
    else 同一总线纪元
        EB->>EB: earliestInRing = ring[0]?.id
        opt earliestInRing > lastEventId + 1（间隙被驱逐）
            EB->>Q: forcePush state_resync_required<br/>{ reason: 'ring_evicted', lastDeliveredId: 42, earliestAvailableId: earliestInRing }
            Note over EB,Q: 无 id 的合成帧，帧在重放之前。<br/>流保持打开；SDK reducer 翻转 awaitingResync。
        end
    end
    loop 环扫描
        EB->>EB: for e in ring where e.id > (epochReset ? 0 : 42)
        EB->>Q: forcePush(e)
    end
    EB->>EB: 附加 AbortSignal 监听器<br/>（onAbort → queue.close({drain:false}); dispose）
    EB-->>SR: AsyncIterable
    SR->>Q: 在 for-await 循环中 next()
```

如果在订阅时 `subs.size >= maxSubscribers`，则抛出 `SubscriberLimitExceededError`——SSE 路由会捕获它并向被拒绝的客户端序列化一个 `stream_error` 合成帧，这样他们就不会看到静默的空流。相反，返回一个空的可迭代对象会让操作员在负载下无法了解“某些客户端获取事件，某些不获取”的情况。

### 环驱逐 → `state_resync_required`（恢复流程）

当消费者使用 `Last-Event-ID: N` 重新连接，并且环中最早幸存的事件具有 `id > N + 1` 时，`[N+1, earliestInRing-1]` 中的事件在消费者重新连接之前被驱逐。简单的重放会静默成功，留下一个非连续的后缀，SDK reducer 会像流是连续的一样继续应用增量，导致其状态与守护进程的真实状态产生分歧——且没有任何终止信号。

在 `EventBus.subscribe()` 中实现：

1. 首先检查 `opts.lastEventId >= this.nextId`。如果为真，则客户端游标来自较旧的总线纪元（守护进程重启 / EventBus 重建），因此总线发出 `reason: 'epoch_reset'` 并重放整个当前环。
2. 否则计算 `earliestInRing = this.ring[0]?.id`。
3. 如果 `earliestInRing > opts.lastEventId + 1`，在重放帧**之前**强制推送一个合成帧：
   ```jsonc
   {
     "v": 1,
     "type": "state_resync_required",
     "data": {
       "reason": "ring_evicted",
       "lastDeliveredId": <opts.lastEventId>,
       "earliestAvailableId": <earliestInRing>
     }
   }
   ```
4. 之后继续正常的重放循环。

关键契约（以及 #4360 review 修正的内容）：

- **无 `id`**——与 `client_evicted` 相同的无槽位模式，因此它不会占用其他订阅者观察到的每个会话单调序列中的槽位。
- **流保持打开**——与 `client_evicted`（真正的终止）不同，`state_resync_required` 是面向恢复的。重放 + 实时帧在之后继续流动。
- **Reducer 自动跳过增量**——SDK 端翻转 `awaitingResync = true` 并仅应用 `state_resync_required`、终止帧和全状态快照，直到消费者代码调用 `loadSession` 并清除该标志。有关 `RESYNC_PASSTHROUGH_TYPES`，请参阅 [`09-event-schema.md`](./09-event-schema.md)。
- **对网络友好**——帧保留在线路上，以便 SDK 以后可以计算“你错过了什么”的差异（如果需要）。不需要额外的重新连接周期。

### 驱逐终止流程

当订阅者的实时积压达到上限且下一次 `push()` 被拒绝时：

1. 标记 `sub.evicted = true`。
2. 构建驱逐数据，向 stderr 发出 `logSubscriberEvicted(evictionData)`，然后构造一个**不带 `id`** 的 `client_evicted` 帧。帧溢出使用 `reason: 'queue_overflow'`；字节溢出使用 `reason: 'queue_bytes_overflow'`。两者都包含 `queueSize`、`maxQueued`、`queuedBytes` 和 `maxQueuedBytes`；字节溢出还包含 `eventBytes`。
3. `queue.forcePush(evictionFrame)` 以便消费者迭代器看到一个终止帧。
4. `queue.close()` 以便在终止帧之后展开迭代。
5. 调用 `sub.dispose()`——从 `subs` 中移除并分离 `AbortSignal` 监听器；如果没有此清理，停滞的消费者的闭包将保持活跃，直到 `AbortSignal` 被垃圾回收。
### Abort flow

`AbortSignal.abort()` → `onAbort()`：

1. `queue.close({drain: false})` — 丢弃缓冲项，防止 SSE 路由继续向无人监听的 socket 序列化事件。
2. `dispose()` — 通过 `disposed` 标志实现幂等。

如果在订阅时信号已被 abort，则在返回迭代器之前会同步调用 `onAbort()`。

## 状态与生命周期

- `nextId` 从 1 开始且只增不减。`lastEventId` getter 返回 `nextId - 1`。
- `ring` 是有界的；一旦填满，通过移位进行驱逐的时间复杂度为 O(n)。在 `ringSize=8000` 时，高并发会话下的耗时仅为几毫秒，远低于单帧延迟预算。环形缓冲区重构将推迟到性能分析标记该问题，或运维人员将 `--event-ring-size` 提高一个数量级时再进行。
- `close()` 翻转 `closed` 状态，关闭每个订阅者的队列，并清空 `subs`。后续的 `publish()` / `subscribe()` 调用将变为空操作（`publish` 返回 undefined；`subscribe` 返回 `emptyAsyncIterable`）。
- 每个 session 拥有一个 `EventBus`。Bus 的关闭发生在 `channel.kill()` 之前，因此在关闭期间进行中的 publish 操作会返回 undefined 而不是抛出异常。

## 依赖关系

- 被 `packages/acp-bridge/src/bridge.ts` 消费（`BridgeClient.sessionUpdate` / `BridgeClient.extNotification` → `events.publish(...)`）。
- 被 `packages/cli/src/serve/routes/sse-events.ts` 消费（SSE 路由处理器 → `events.subscribe(...)`，然后将 `BridgeEvent` 格式化为 SSE 线路帧）。
- CLI 消费方直接从 `@qwen-code/acp-bridge/eventBus` 导入 event bus。
- SDK 消费方：`packages/sdk-typescript/src/daemon/sse.ts`（`parseSseStream`），然后是 `asKnownDaemonEvent`（参见 [`09-event-schema.md`](./09-event-schema.md)、[`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md)）。

## 配置

- `--event-ring-size <n>` — 每个 session 的 ring 深度；软上限为 `MAX_EVENT_RING_SIZE = 1_000_000`。
- `GET /session/:id/events` 上的订阅者 `?maxQueued=N` 查询参数，范围 `[16, 2048]`。SDK 客户端在启用前会预检 `caps.features.slow_client_warning`。
- `EventBus(..., { maxQueuedBytes })` 构造函数选项仅用于测试或嵌入式调用方。默认值为 2 MiB，无效值会抛出 `TypeError`。故意不提供 `?maxQueuedBytes` 查询参数。
- `BridgeOptions.eventRingSize`（覆盖嵌入式使用的 daemon 默认值）。
- 能力标签：`session_events`、`slow_client_warning`、`typed_event_schema`。

## 客户端集成：`Last-Event-ID` 重连

### 线路格式

`GET /session/:id/events` 发出的每个包含 id 的 SSE 帧都包含一个 `id:` 行：

```
id: 42
event: session_update
data: {"id":42,"v":1,"type":"session_update","data":{...},"_meta":{"serverTimestamp":1719000000000}}

```

合成/终止帧（`state_resync_required`、`replay_complete`、`client_evicted`、`slow_client_warning`、`stream_error`）发出时**不带** `id:` 行 — 它们不会推进每个 session 的单调递增序列。

### 重连协议

当客户端在断开连接后重新连接时，它会将最后成功接收的 event id 作为 `Last-Event-ID` HTTP 头发送：

```
GET /session/:id/events HTTP/1.1
Last-Event-ID: 42
Accept: text/event-stream
```

daemon 的 `EventBus` 会从 ring buffer 中重放所有 `id > Last-Event-ID` 的事件，然后切换到实时推送。一个 `replay_complete` 合成帧标志着重放和实时推送之间的边界：

```jsonc
// no id: line — synthetic
{
  "v": 1,
  "type": "replay_complete",
  "data": { "replayedCount": 7, "lastReplayedEventId": 49 },
}
```

### 重放行为

| 场景                                       | 行为                                                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 缺失 `Last-Event-ID`                       | 仅实时流；无重放。与 resume 之前的客户端向后兼容。                                                                                                                  |
| `Last-Event-ID: 0`                         | 从头开始重放整个 ring buffer（受 `--event-ring-size` 限制，默认 8000）。                                                                                            |
| `Last-Event-ID: N` 且 `ring[0].id <= N+1`  | 连续重放 `id > N` 的事件，然后进入实时推送。                                                                                                                        |
| `Last-Event-ID: N` 且 `ring[0].id > N+1`   | 检测到间隙 — 在重放剩余后缀之前发出 `state_resync_required`（`reason: 'ring_evicted'`）。SDK 必须调用 `loadSession` 来恢复完整状态。                                |
| `Last-Event-ID: N` 且 `N >= nextId`        | Epoch 重置（daemon 重启）— 发出 `state_resync_required`（`reason: 'epoch_reset'`），然后进行完整的 ring 重放。                                                      |

### 校验规则

daemon 严格解析 `Last-Event-ID`：

- 仅接受纯十进制数字字符串（例如 `"42"`）。
- 非数字、负数、小数或溢出值（超过 `Number.MAX_SAFE_INTEGER`）会被静默拒绝 — 流将以仅实时模式启动，并且 daemon 会记录一条 breadcrumb 日志。
- `retry: 3000` 指令会通知符合规范的 `EventSource` 实现等待 3 秒后再重连。

### 向后兼容性

`Last-Event-ID` 机制是完全按需启用的：

- 从不发送该头的客户端将收到一个仅实时的流，其行为与 resume 之前完全相同。
- 不跟踪 event id 的旧版 SDK 仍可继续工作。
- `replay_complete` 帧是合成的（无 `id:`），因此不会让不感知 id 的消费方产生混淆。

### 浏览器 `EventSource` 限制

浏览器原生的 `EventSource` API 会自动跟踪最后一个 `id:` 字段并在重连时发送。但是，它**无法**设置自定义头（例如 `Authorization: Bearer`）。需要身份验证的客户端必须使用原生 `fetch()` + 手动解析 SSE（就像 TypeScript SDK 通过 `parseSseStream` 所做的那样），而不能使用 `EventSource`。SDK 的 `RestSseTransport` 演示了这种模式 — 它在 `fetch()` 调用中将 `Last-Event-ID` 设置为显式的 HTTP 头。

## 注意事项与已知限制

- **合成帧没有 `id`。** 使用 `Last-Event-ID` 恢复的 SDK 消费方只记录带有 id 的帧；`slow_client_warning`、`client_evicted`、`state_resync_required` 和 `replay_complete` 不会推进游标，也不会消耗每个 session 的序列号。如果两个带 id 的实时帧之间存在真实的间隙，请通过 ring 驱逐 / epoch 重置的重同步路径来处理，而不是将其视为私有的合成帧。
- `client_evicted` 是**每个订阅者**维度的，而不是每个 session 维度的。同一个客户端可以重新连接。
- `BoundedAsyncQueue` 迭代器**对并发驱动不安全** — 两个同时的 `.next()` 调用会竞争同一个事件。Daemon 的使用是顺序的（在 SSE 路由处理器中使用 `for await ... of`），因此在生产环境中是安全的。
- 目前 bus 是包私有的（package-private）；channels 和 Web UI 必须通过 daemon 的 HTTP SSE 路由进行订阅，而不能直接访问 bus。Stage 1.5 将解除此限制。

## 参考资料

- `packages/acp-bridge/src/eventBus.ts`（整个文件）
- `packages/acp-bridge/src/bridge.ts`（publish 站点，特别是 `BridgeClient.sessionUpdate` 和 F3 权限事件）
- `packages/cli/src/serve/routes/sse-events.ts`（SSE 路由处理器 — 将 `BridgeEvent` 格式化为线路 SSE）
- `packages/sdk-typescript/src/daemon/sse.ts`（客户端侧的 SSE 线路解析器）
- 线路参考：[`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)（`Last-Event-ID` 重连契约）。