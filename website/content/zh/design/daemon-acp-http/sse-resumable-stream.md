# ACP-over-HTTP — 可恢复的会话事件流 (`Last-Event-ID`)

> 状态：本 PR 中的设计与实现。
> 修复了 RFD 第 4 阶段跟踪的可恢复性缺口，
> 对应 [`README.md`](./README.md) §7 / "Resume cursor (ring `Last-Event-ID`)" 行。

## 问题

`/acp` Streamable-HTTP 会话事件流（带有 `Acp-Session-Id` 请求头的 `GET /acp`）是**仅实时**的：它既不生成 SSE `id:` 序列，也不在重连时遵循 `Last-Event-ID` 请求头。

当控制面代理在回合中途因空闲而关闭长连接 SSE 时（daemon 本身发送 `retry: 3000`，且入口代理经常切断长 SSE），客户端重连并重新获取所有权，但**在间隙期间 daemon 生成的每个内容帧都会丢失** —— 即携带 `agent_thought_chunk` / `agent_message_chunk` 的 `session/update` 通知。回合仍会到达终止状态（生成/合成了 `turn_complete`），因此 UI 显示“完成”，但 body 为空或被截断。重新发送相同的 prompt 可以正常工作，这就是线索：丢失发生在传输间隙，而不是模型端。

症状和现场证据已记录在集成笔记的 **§1.8** (`sdk-known-issues.md`) 中。

## 现有基础（以及为什么改动很小）

重放引擎**已经构建并经过了实战检验** —— 缺口仅在于 `/acp` 传输层未与其连接。

`packages/acp-bridge/src/eventBus.ts`：

- 每个会话单调递增的 `id`，从 1 开始（`nextId`，在 `publish()` 中分配）。
- 每个会话的有界环形缓冲区（`DEFAULT_RING_SIZE = 8000`，可通过 `qwen serve --event-ring-size` 覆盖）。
- `subscribeEvents(sessionId, { lastEventId, signal })` 在实时事件流入之前，重放 `id > lastEventId` 的环形缓冲区帧，并发出合成控制帧 `replay_complete`、`state_resync_required`（环形缓冲区驱逐 / daemon 重启时的 epoch 重置）、`client_evicted`、`slow_client_warning`。

**REST** 接口 `GET /session/:id/events` 已经消费了所有这些：它读取 `last-event-id`（`server.ts` → `parseLastEventId`），将其传递给 `subscribeEvents`，并使用 SSE `id:` 行序列化每一帧（`formatSseFrame`）。Bug 在于 **`/acp` 传输层**没有做这些：

| 层                                     | REST `/session/:id/events` | `/acp` GET（当前）                            |
| ----------------------------------------- | -------------------------- | --------------------------------------------- |
| 读取 `Last-Event-ID` 请求头              | 是                        | **否**                                        |
| 将 `lastEventId` 传递给 `subscribeEvents` | 是                        | **否**（`dispatch.ts pumpSessionEvents`）      |
| 发出 SSE `id:` 行                      | 是（`formatSseFrame`）     | **否**（`SseStream.send` 仅写入 `data:`） |

`acp-http/sse-stream.ts` 甚至在注释中说明了这一点：_"no ring-buffer `id:` sequencing — resumability is RFD Phase 4, deferred."_ 本 PR 取消了该推迟。

## 线路决策 —— SSE `id:` 行（而非 payload 内的 `_meta`）

这两个 SSE 接口承载**不同的 payload**：

- REST 流传输 **`BridgeEvent` 信封**（`{ id, v, type, data, _meta }`）。SDK 解析器（`sdk-typescript/src/daemon/sse.ts`）从 **JSON 信封的 `id` 字段**中提取游标（它只读取 `data:` 行）。
- `/acp` 流传输**原始 JSON-RPC 2.0 对象**（`session/update` 通知、`session/request_permission` 请求、响应）。这些对象没有信封 `id` 来承载总线游标，且 JSON-RPC `id` 另有含义（请求 id）。

因此，对于 `/acp`，恢复游标是**标准的 SSE `id:` 行**：

- 它是 EventSource 原生的 —— 符合规范的 SSE 客户端（包括内置的 `AcpHttpTransport`）会自动跟踪最后一个 `id:`，并在重连时自动将其作为 `Last-Event-ID` 请求头发送回去。
- 它保持 JSON-RPC payload 干净（不会将非标准的 `_meta.qwen.eventId` 注入到协议帧中）。
- 它镜像了 `formatSseFrame` 在 REST 上已经发出的内容，因此两个接口共享**相同的** `eventBus` id 和相同的 `Last-Event-ID` 语义。

只有**总线发起的**帧才携带 `id:`（`session/update`、`session/request_permission`、daemon 推送的通知）。在会话流上运行的 JSON-RPC **响应/回复**不是总线事件，**不**携带 `id:` —— 它们不在环形缓冲区中，且故意不进行重放跟踪（丢失的飞行中 prompt _响应_ 是单独跟踪的 §1.7 问题，不在本范围内；§1.8 是关于丢失的 _内容_ 帧，它们都是总线 `session/update` 事件）。

合成终止帧（`client_evicted`、`stream_error` 等）没有总线 `id`，因此不发出 `id:` 行 —— 这与 REST 匹配，因此它们不会消耗客户端恢复所依据的单调序列中的槽位。

## 变更

1. **`transport-stream.ts`** — `send(message, id?: number)`。可选的 `id` 是用于 SSE 游标跟踪的总线事件 id。
2. **`sse-stream.ts`** — 当 `id !== undefined` 时，`send(message, id?)` 会在 `data:` 行前添加 `id: ${id}\n`（镜像 `formatSseFrame`）。
3. **`ws-stream.ts`** — `send(message, id?)` 接受并**忽略** `id`：WebSocket 是有状态连接，无 SSE 重放（与 `AcpWsTransport.supportsReplay = false` 一致）。
4. **`connection-registry.ts`** — `sendSession(sessionId, frame, id?)` 将 `id` 传递给 `stream.send`。每个会话的预附加（pre-attach）**缓冲区**存储 `{ frame, id? }` 对，以便缓冲帧在附加时刷新时保留其游标。（连接范围的缓冲区保持不变 —— 这些帧是没有总线 id 的 JSON-RPC 响应。）
5. **`dispatch.ts`**
   - `translateEvent` 在每次针对总线事件的 `sendSession` / `binding.stream.send` 调用中传递 `event.id`。
   - `pumpSessionEvents(conn, sessionId, signal, lastEventId?)` 将 `lastEventId` 转发给 `subscribeEvents` —— 直接复用现有的环形缓冲区重放。
6. **`index.ts`** — `GET /acp` 会话流分支读取 `Last-Event-ID` 请求头（通过严格的 `parseLastEventId`，与 REST 相同的仅接受十进制数字规则），并将其传递给 `pumpSessionEvents`。

无 `eventBus`/bridge 变更 —— 引擎被原样复用。

## 使恢复真正生效（会话流宽限期/重新获取）

上述 `id:`/`Last-Event-ID` 底层机制是必要的，但**不充分** —— 仅靠它本身在实际流程中永远不会触发。以前，当会话 SSE 流在传输层关闭时，GET 处理程序会运行**完整的** `closeSessionStream` 拆除流程：它从 `ownedSessions` 中移除会话，中止飞行中的 prompt，并分离 bridge 客户端。在实际的 EventSource/代理顺序中（旧 socket _先_关闭，然后客户端重连），这意味着携带 `Last-Event-ID` 的重连会在读取游标之前被所有权检查拒绝为 **403** —— 并且生成内容的 prompt 已经被中止。重放引擎将没有东西可以重连。

因此，传输层的会话流关闭现在执行**分离（detach）** 而不是拆除（tear down）（`AcpConnection.detachSessionStream`）：它仅停止流及其事件订阅，并在宽限期（`SESSION_GRACE_MS`，镜像 `CONN_GRACE_MS`）内**保持绑定、所有权、飞行中的 prompt 以及 bridge 客户端注册**处于活动状态。在窗口内重连会重新附加（`attachSessionStream` 清除宽限期计时器 —— 重新获取），并且环形缓冲区重放会填补间隙。如果没有重连到达，宽限期计时器将运行完整的拆除 —— 从而限制失控 prompt 的成本。对于显式的 `session/close` 和连接拆除（`destroy`），完整拆除仍然立即执行。GET 处理程序根据 `stream.isClosed` 进行分支：传输关闭 → 带宽限期的分离；当流仍然打开时 pump 结束（子进程完成 / 迭代器错误） → 完全关闭（僵尸流）。

### 这解锁的两个重放正确性保障

在恢复实际运行之前，两者都处于潜伏状态；上述宽限期/重新获取使它们变得可达，因此它们一起发布：

- **无重复交付且无静默丢失（buffer ↔ ring）。** 缓冲的总线事件_也_在 EventBus 环形缓冲区中（它在那里发布以获取其 id）。因此，在恢复时（存在 `Last-Event-ID`），`attachSessionStream` 会被赋予游标，并且**根本不会刷新携带 id 的缓冲帧** —— 环形缓冲区重放（从客户端的游标开始）是游标之后每个总线事件的唯一交付路径。这故意_不是_“刷新缓冲区，然后将重放游标推进到其之后”：发送到现已死亡的 socket 但客户端从未收到的帧，其 id _低于_缓冲区的 id 但_高于_客户端的游标，因此将游标推进到缓冲区之后会**静默丢弃它**。让环形缓冲区拥有所有总线事件可以确保每个事件准确交付一次且无间隙。_无_ id 的帧（通过 `replySession` 路由的 JSON-RPC 回复）不是环形缓冲区事件，因此环形缓冲区不会重新交付它们 —— 但它们在附加时也不能被刷新：在重放之前刷新的缓冲 `session/prompt` _结果_ 将先于其前面的内容块到达（客户端在 body 之前看到“完成” —— 这正是 §1.8 修复的截断 body 故障）。因此，在恢复时，无 id 的帧会被**延迟**：留在缓冲区中，并且事件 pump 会在重放排空后释放它们（`flushBufferedSessionFrames`） —— **仅在** `replay_complete` 时，以保持原始流顺序。关键是不在 `state_resync_required` 时刷新：EventBus 在重放帧_之前_发出该帧（然后在末尾发出 `replay_complete`），因此在其上刷新会将回复置于重放内容之前。仅实时情况（无 `Last-Event-ID` ⇒ 无重放 ⇒ 无 `replay_complete`）由 pump 的循环后安全刷新覆盖。（没有 `Last-Event-ID` 的新连接没有环形缓冲区锚点，因此它会立即按顺序刷新整个缓冲区，就像以前一样。）
- **重放下的 `permission_request` 幂等性。** `permission_request` 是携带 id 的环形缓冲区事件，因此游标在仍未回答的权限之前的重连会重放它。`translateEvent` 现在复用该 `bridgeRequestId` 的现有 `conn.pending` 条目（重新发送相同的出站 JSON-RPC id 以进行追赶），而不是生成第二个 id + 条目 —— 没有孤立的 pending，对于在 `_meta.requestId` 上进行去重的客户端也没有双重 prompt。

`parseLastEventId` 被提取到共享的 `serve/sse-last-event-id.ts` 中，供 REST 和 `/acp` 接口使用，因此它们的严格接受/拒绝规则和 operator 日志记录不会发生偏移。

## 向后兼容性

- **不发送 `Last-Event-ID` 的旧客户端** → `lastEventId` 为 `undefined` → `subscribeEvents` 从实时开始，与今天完全相同。
- **添加 `id:` 行是向后兼容的 SSE** —— 忽略该字段的客户端不受影响；基于 EventSource 的客户端会免费开始跟踪它。
- **内置的 SDK `AcpHttpTransport` 在本 PR 中启用了重放** —— 它设置 `supportsReplay = true` 并在重连时重新发送 `Last-Event-ID`，因此间隙帧从环形缓冲区重放，并且 §1.8 的内容丢失问题被关闭，**无需进一步的 daemon 更改**。（单独的外部 `agent-web` 传输切换保持推迟 —— 见 Out of scope。）对于任何仍然报告 `supportsReplay = false` 并省略该请求头的消费者，daemon 更改仍然无效。
- REST 接口未受影响。

## 测试计划

- `sse-stream.test.ts` — `send(msg, 7)` 在 `data:` 之前发出 `id: 7\n`；`send(msg)`（无 id）省略 `id:` 行；顺序为 `id:` → `data:` → 空行。
- `transport.test.ts`（通过 `/acp` 传输的端到端测试）：
  - 实时 `session/update` 帧现在带有 `id:` 行到达；
  - 携带 `Last-Event-ID: N` 的 `GET /acp` 将游标流向 `subscribeEvents`；没有请求头的新流行为与今天相同；
  - 溢出的 `Last-Event-ID`（> `MAX_SAFE_INTEGER`） → 仅实时；
  - **真实的先关闭后重连顺序**：_先_关闭旧 SSE，然后使用 `Last-Event-ID` 重连 —— 断言返回 **200 而不是 403**（保留所有权）且 prompt **未**被中止（宽限期/重新获取）；
  - 重放的 `permission_request` 复用 pending 条目（相同的出站 id）。
- `connection-registry.test.ts` — 非恢复附加刷新整个缓冲区并传递每个帧的 `id`；**恢复**附加（存在游标）跳过携带 id 的帧（环形缓冲区重放拥有它们），但仍然刷新无 id 的 JSON-RPC 回复；`detachSessionStream` 在宽限期窗口内保持所有权/prompt，然后在到期时拆除；窗口内的重连会重新获取（取消待处理的拆除）。
- `ws-stream.test.ts` — `send(msg, id)` 忽略 id：WS 线路帧是纯 JSON，没有 SSE `id:` 帧泄漏进来。

## 超出范围（仍推迟）

- WebSocket / HTTP/2 传输。
- §1.7 跨连接权限解析（在不同的 `Acp-Connection-Id` 上 POST 的投票，而不是流传输 prompt 的那个） —— 一个单独的、安全敏感的问题，作为其自己的后续任务跟踪。本 PR 确实使 `permission_request` 转换在重放下具有幂等性（如上所述），但没有添加会话全局的 requestId 解析。它也没有为**已解析权限添加响应重放幂等性**：一旦客户端投票，pending 条目就会被消耗，因此稍后重连重放（仍在环形缓冲区中的）`permission_request` 会使用相同的 `_meta.requestId` 重新发送 prompt。符合规范的客户端会根据该 id 进行去重（重放路径已经依赖的契约），并且残留的孤立 pending 条目会在拆除时被回收 —— agent 永远不会停滞 —— 但在有界的每个会话 LRU 中记录已解析的结果以重新发送记录的投票（对于不去重客户端的完全幂等性）属于同一个权限协调后续任务，因为它将已解析的权限状态添加到投票路径中。
- 会话流上丢失的飞行中 _prompt 响应_ —— 恢复的内容帧都通过 `eventBus` 环形缓冲区流动；JSON-RPC 响应不是环形缓冲区事件。
- 外部 `agent-web` `AcpHttpTransport` 中消费者端的 `supportsReplay` 切换（位于不同的仓库；已被本 PR 解除阻塞）。
- **通过导出的 SDK 传输进行权限投票。** 导出的 `AcpHttpTransport`/`AcpWsTransport` 将 `session/request_permission` 作为 `permission_request` 事件暴露，但 SDK 的投票 API（`respondToPermission` / `respondToSessionPermission`）映射到 ACP daemon 没有处理程序的 `session/permission` 请求 —— 它仅接受权限投票作为回显出站 `_qwen_perm_N` id 的 JSON-RPC _响应_。连接投票往返是 §1.7 权限协调后续任务的一部分。一个相关的方面：无订阅者会话**回复 pump**（`ensureSessionReplyPump`）打开一个真实的 `GET /acp` 会话流，daemon 将其视为实时流 —— 因此，当仅附加回复 pump 时引发的 agent `permission_request` 会被路由到该流并被 pump 丢弃（它仅转发 JSON-RPC 响应），从而挂起中介，而在完全没有流的情况下，daemon 会取消拒绝并且 agent 继续。daemon 端的“这是真实消费者还是仅仅是回复 pump？”区分以及 SDK 端的处理（在本地拒绝 / 暴露给权限回调）都属于同一个权限协调后续任务，因为 pump 本身无法进行投票。需要权限处理的消费者应在发出会话 RPC 之前打开 `subscribeEvents`（记录的契约），这为 daemon 提供了一个真实的消费者流。
- **在导出的 `AcpHttpTransport` 的 `subscribeEvents` 循环内部发出的会话 RPC。** 会话 `/acp` 流是单读取器的：当消费者的异步生成器在 `yield` 之间暂停时，读取器不会排空。如果消费者在其自己的事件处理循环内 `await` 会话路由的 RPC（`session/set_model`、`session/prompt` 等），`sendRequest` 会抑制后台回复 pump（订阅是“活动的”），但暂停的生成器永远不会读取回复 —— 调用会挂起，直到消费者拉取下一个事件。稳健的修复方法是使会话读取器成为始终排空 JSON-RPC 回复并仅将 `DaemonEvent` 排队给迭代器的后台 pump；由于这是对 opt-in 的新导出传输的结构性更改且不影响默认的 REST 传输，因此作为专注的后续任务推迟。
- **`SESSION_STREAM_REPLY_METHODS` ⇄ `replySession` 偏移的自动化防护。** SDK 的 `SESSION_STREAM_REPLY_METHODS` 集合必须镜像 daemon 在 `dispatch.ts`（不同的包）中的 `replySession(...)` 调用站点；在那里添加方法而不在此处添加方法将不会打开回复 pump，并且针对它的无订阅者 `sendRequest` 会挂起直到中止。两个包的类型系统都没有强制执行这一点。CI 防护（一个轻量级脚本或 vitest，提取 daemon 的会话回复方法名称并与 SDK 集合进行 diff）是正确的修复方法，但跨包静态分析工具本身就是一个专注的任务 —— 并且不是简单的 grep：正确的提取器需要轻量级的数据流分析，因为 `session/prompt` 的回复_不是_在其 `case 'session/prompt'` 块内发出的。prompt 异步启动，其 `replySession(...)` 稍后从 prompt 完成处理程序（不同的调用站点）触发，因此简单的“哪些 `case` 块包含 `replySession`”扫描会错误地_排除_ `session/prompt` 并针对正确的集合使构建失败。与此同时，该集合很小且稳定，并且常量上的 JSDoc 记录了该不变量；稳健的长期修复方法是让 daemon 广播其会话路由的方法名称（单一事实来源），而不是抓取 `dispatch.ts`。