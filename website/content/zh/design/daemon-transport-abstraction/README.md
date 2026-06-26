# DaemonTransport 抽象层

> 目标分支：`main`。作者：arnoo.gao。日期：2026-06-12。状态：**设计 v4 — 审核中**。
> 按照“设计先行”的仓库工作流：本文档将在实现 PR 之前落地。

---

## 0. 概览

`DaemonClient` 硬编码了 REST+SSE。希望使用 ACP WebSocket 的第三方集成必须 fork 整个提供者栈（约 8 个文件）。此方案新增了一个包含 `fetch` + `subscribeEvents` 方法的 **`DaemonTransport` 接口**，并支持自动检测和运行时回退，从而实现可插拔的传输层，且**零破坏性变更**。

**总改动量：约 1300 行**，在一个实现 PR 中完成。现有消费者无需修改 — `new DaemonClient({ baseUrl, token })` 保持当前行为不变。

---

## 1. 背景

### 1.1 当前架构

```
DaemonClient({ baseUrl, token })
  └─ this._fetch = globalThis.fetch     ← 硬编码
  └─ subscribeEvents → GET /session/:id/events → parseSseStream → DaemonEvent
```

67 个公共方法，每个都构造 REST URL 并根据 HTTP 状态码分支。虽然 `fetch` 已通过 `DaemonClientOptions.fetch` 可注入，但 `subscribeEvents` 包含内联的 SSE 特定逻辑（content-type 检查、SSE 解析、连接阶段超时），仅靠 fetch 注入无法替换。

### 1.2 第三方的问题

当第三方（例如 `agent-web`）构建 `AcpSessionProvider` 以使用 WebSocket 而不是 REST+SSE 时：

- **如果替换** `DaemonSessionProvider`：读取 `DaemonStoreContext` 的组件（例如 TerminalView）会丢失上下文 → 崩溃。
- **如果同时保留两个提供者**：两个事件源，两个存储，不同步。
- **如果向 SDK 存储注入事件**：`DaemonSessionProvider` 内部仍会订阅 SSE → 重复事件。

**根本原因**：更换传输层需要替换提供者，因为 `DaemonClient` 的 `subscribeEvents` 硬编码为 SSE。

### 1.3 目标

```
DaemonClient({ transport: new AcpWsTransport(url, token) })
  └─ transport.fetch → 将 URL+动词映射为 JSON-RPC over WS
  └─ transport.subscribeEvents → 解复用 WS 通知 → DaemonEvent
```

一个提供者，一个存储，传输层是内部细节。第三方将 `transport` 传给 `DaemonClient`；其他一切保持不变。

---

## 2. 设计

### 2.1 接口

```typescript
interface DaemonTransportFetchOptions {
  timeout?: number; // 0 = 无超时。undefined = 传输层默认值。
}

interface DaemonTransportSubscribeOptions {
  lastEventId?: number;
  maxQueued?: number;
  signal?: AbortSignal;
  connectTimeoutMs?: number;
}

interface DaemonTransport {
  /**
   * 发送请求并返回 Response。
   *
   * 约定：
   * - Response 必须支持 .json()、.text()、.ok、.status、
   *   .headers.get()、.body?.cancel()
   * - .status 必须是准确的 HTTP 状态码
   *   (200, 201, 202, 204, 404 等)
   * - 错误正文必须保留 daemon 的结构化格式
   * - 无需预先设置即可调用；传输层在内部处理初始化
   *   （延迟初始化 / 一次性初始化模式）
   * - 连接断开时抛出 DaemonTransportClosedError
   * - 当 init.signal 中止时：对于 prompt 请求，传输层必须
   *   取消线路上的进行中 prompt（WS：发送 session/cancel
   *   RPC；HTTP：中止 fetch）。对于普通请求，仅拒绝/取消
   *   挂起的请求，无副作用。
   *   挂起的响应以 AbortError 拒绝。
   */
  fetch(
    url: string,
    init: RequestInit,
    opts?: DaemonTransportFetchOptions,
  ): Promise<Response>;

  /**
   * 订阅会话事件。
   *
   * 约定：
   * - 具有 id 的事件必须是单调递增的整数 id；合成/终端
   *   帧（例如 stream_error）可以省略 id（DaemonEvent.id 是可选的）
   * - 必须在一个流中传递所有事件类型（会话 + 工作空间）
   * - 中止 signal 必须只停止此生成器，而不是连接
   * - 当连接断开时，所有挂起的生成器都必须抛出
   *   DaemonTransportClosedError（传输层维护生成器引用）
   * - 必须仅对连接阶段应用 connectTimeoutMs
   * - 传输层必须声明是否支持 lastEventId 重放；
   *   如果不支持，消费者在重连时必须使用 session/load 进行完全重新同步
   */
  subscribeEvents(
    sessionId: string,
    opts: DaemonTransportSubscribeOptions,
  ): AsyncGenerator<DaemonEvent>;

  /** 传输层标识，用于穷举切换。 */
  readonly type: 'rest' | 'acp-http' | 'acp-ws';

  /** 此传输层是否支持基于 Last-Event-ID 的重连重放。
   *  为 false 时，消费者必须使用 session/load 进行完全重新同步。 */
  readonly supportsReplay: boolean;

  /** 连接断开或 dispose() 后为 false。 */
  readonly connected: boolean;

  /** 幂等清理。 */
  dispose(): void;
}

class DaemonTransportClosedError extends Error {}
```

### 2.2 为什么是两个方法（fetch + subscribeEvents），而不是只有 fetch

`subscribeEvents` 在每个传输层上有根本不同的线路语义：

| 传输层  | 线路机制                                                     |
| ------- | ------------------------------------------------------------ |
| REST    | `GET /session/:id/events` → SSE → `parseSseStream` → `DaemonEvent` |
| ACP HTTP | `GET /acp`（会话作用域的 SSE）→ JSON-RPC 通知解包           |
| ACP WS  | 从共享套接字按 sessionId 解复用通知                          |

将它们强制塞入 fetch 形状需要重新编码/解码 SSE（WS → 伪造的 SSE 文本 → `parseSseStream` → DaemonEvent）— 既浪费又脆弱。

其他 66 个方法都通过 `fetch` 工作，因为它们遵循请求→响应语义，无论传输层如何。

### 2.3 为什么是 fetch 级别，而不是方法调度

DaemonClient 的 67 个方法中包含按方法进行的 HTTP 分支：

- `prompt()`：202 与 200 状态检查
- `deleteWorkspaceAgent()`：204 与 404（含有正文检查）
- `respondToPermission()`：200 与 404（用于竞态检测）
- 6 个方法绕过 `fetchWithTimeout`，直接调用 `_fetch`

一个方法调度接口（`request<T>(method, params)`）会迫使在每个传输层中复制所有这些逻辑。fetch 级别则保持 DaemonClient 不变。

### 2.4 DaemonClient 变更（约 40 行）

```typescript
export interface DaemonClientOptions {
  baseUrl: string;
  token?: string;
  fetch?: typeof globalThis.fetch; // 保留
  fetchTimeoutMs?: number; // 保留
  transport?: DaemonTransport; // 新增 — 可选覆盖
}
```

内部变更：

- 构造函数：`this.transport = opts.transport ?? new RestSseTransport(...)`
- `fetchWithTimeout`：委托给 `this.transport.fetch(url, init, { timeout })`
- 6 个直接 `this._fetch` 的位置（prompt、promptNonBlocking、recapSession、btwSession、shellCommand、subscribeEvents）：替换为 `this.transport.fetch(url, init, { timeout: 0 })`
- `subscribeEvents`：基于 `this.transport.type` 的穷举切换：
  - `'rest'`：委托给 `this.transport.subscribeEvents(sessionId, opts)`
  - 默认：相同的委托（每个传输层处理自己的线路格式）
- 移除 `private _fetch` 字段（由 transport 替代）

### 2.5 提供者注入点

`DaemonWorkspaceProvider` 和 `DaemonSessionProvider` 都在内部构造 `DaemonClient`。为了让第三方在不绕过提供者的情况下注入传输层：

```typescript
// DaemonWorkspaceProvider — 添加可选的 transport 属性
interface DaemonWorkspaceProviderProps {
  baseUrl: string;
  token?: string;
  transport?: DaemonTransport; // 新增 — 传递给 DaemonClient
  // ...现有属性
}

// DaemonSessionProvider — 从工作空间上下文继承
// 不需要 transport 属性；从工作空间上下文读取
```

当提供了 `transport` 时，提供者将其传递给 `DaemonClient`：

```typescript
new DaemonClient({ baseUrl, token, transport: props.transport });
```

当省略时：当前行为（REST+SSE）。提供者更改约 5 行。

### 2.5 RestSseTransport（约 80 行）

包装 `globalThis.fetch` + 提取当前来自 `DaemonClient.subscribeEvents` 的 SSE 逻辑：

```typescript
class RestSseTransport implements DaemonTransport {
  readonly type = 'rest' as const;
  readonly supportsReplay = true; // SSE 支持 Last-Event-ID
  readonly connected = true; // REST 是无状态的

  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined,
    private readonly _fetch: typeof globalThis.fetch,
  ) {}

  fetch(url, init, opts?) {
    return this._fetch(url, init);
  }

  async *subscribeEvents(sessionId, opts) {
    // 当前 DaemonClient.subscribeEvents 逻辑移至此处：
    // - 从 this.baseUrl + sessionId 构建 URL
    // - 从 this.token 设置 Authorization 标头
    // - 连接阶段超时来自 opts.connectTimeoutMs
    // - fetch → 验证 content-type → parseSseStream → yield
  }

  dispose() {} // 无操作
}
```

### 2.6 ACP 传输层内部实现

**AcpWsTransport**（约 400-600 行）：

- 延迟初始化：首次 `fetch` 调用打开 WS 并发送 `initialize`
- URL→JSON-RPC 映射表：`/session/:id/prompt` → `{method: "session/prompt", params: {sessionId: id, ...body}}`
- 请求复用器：`Map<id, {resolve, reject}>` 用于挂起的请求
- `subscribeEvents`：按 sessionId 过滤共享的通知流
- `connected`：跟踪 WS readyState
- `supportsReplay`：false（WS 没有 Last-Event-ID；消费者必须使用 `session/load`）
- 合成具有正确 `.status`/`.json()`/`.text()` 的 `Response` 对象

**AcpHttpTransport**（约 800-1000 行）：

- 延迟初始化：首次 `fetch` 调用发送 `POST /acp {initialize}`
- 内部管理连接作用域和会话作用域的 SSE 流
- 相同的 URL→JSON-RPC 映射 + 请求关联
- `supportsReplay`：true（会话 SSE 支持 Last-Event-ID）

### 2.7 传输层自动检测

服务器在 `GET /capabilities` 中通告支持的传输层：

```json
{
  "transports": ["rest+sse", "acp-http+sse", "acp-ws"],
  ...现有 capabilities 字段...
}
```

SDK 提供一个一次性的静态工厂：

```typescript
// 在 React 渲染前探测一次，会话期间从不切换
const transport = await DaemonTransport.negotiate(baseUrl, token);
// 返回最佳可用：acp-ws > acp-http > rest（回退）
```

实现：

1. `GET /capabilities` → 读取 `transports` 数组
2. 如果列表中有 `acp-ws` → 尝试 WS 升级；成功则返回 `AcpWsTransport`
3. 如果 WS 失败或不在列表中 → 尝试 `acp-http`；成功则返回 `AcpHttpTransport`
4. 回退 → `RestSseTransport`

不影响现有 API：`GET /capabilities` 新增一个字段（追加），现有消费者忽略未知字段。

### 2.8 运行时回退（WS → REST 断开时）

当非 REST 传输层在会话中断开时：

```
AcpWsTransport (connected=true)
  │
  ├── WS 断开（网络、服务器重启、空闲超时）
  │
  ├── connected = false
  ├── 所有挂起的 fetch() 调用 → 以 DaemonTransportClosedError 拒绝
  ├── 所有 subscribeEvents 生成器 → 抛出 DaemonTransportClosedError
  │
  └── 消费者（Provider / 第三方）检测到断开：
        1. 创建新的 RestSseTransport（如果 daemon 运行中，保证可用）
        2. 创建新的 DaemonClient({ transport: newTransport })
        3. 对于每个活跃会话：session/load 以重新附加
        4. 恢复事件订阅
```

**关键约束**：运行时回退是**消费者驱动的，不是传输层内部的**。
传输层不会静默切换协议 — 它会大声失败（`DaemonTransportClosedError`），由消费者决定是否重建。

理由：

- WS 终止会销毁服务器端所有拥有的会话（`registry.delete` → `conn.destroy`）。静默切换会隐藏此数据丢失。
- `session/load` 会重新附加到现有的 bridge 会话（保留转录），但进行中的 prompt 会被中止。消费者必须显式处理（重试或向用户展示）。
- 跨传输层尚无 `Last-Event-ID` 恢复（阶段 4）。断开和重连之间的事件可能丢失。消费者应通过 `session/load` 请求完全状态重新同步（它会重放历史）。

**AutoReconnectTransport**（约 150 行，可选包装器）：

```typescript
class AutoReconnectTransport implements DaemonTransport {
  constructor(
    private baseUrl: string,
    private token: string,
    private preferred: 'acp-ws' | 'acp-http' | 'rest',
  ) {}

  // 当内部传输层抛出 DaemonTransportClosedError 时：
  // 1. 尝试重新创建首选传输层
  // 2. 如果首选失败，回退到 REST
  // 3. 重新初始化连接
  // 调用者仍然需要 session/load — 此包装器仅
  // 处理传输层级别的重连，不处理会话级别。
}
```

此包装器是可选的。不需要自动重连的现有消费者只需捕获 `DaemonTransportClosedError` 并自行处理。

**对现有功能的影响**：零。所有自动检测和回退代码都是追加的且可选的。不带 `transport` 的 `new DaemonClient({ baseUrl, token })` = 当前 REST 行为，无自动检测，无回退逻辑。

---

## 3. 破坏性变更审计

### 结论：零破坏性变更

| 公共 API                             | 变更                                   | 破坏性？ |
| ------------------------------------ | -------------------------------------- | :------: |
| `new DaemonClient({ baseUrl, token })` | 不变                                   |    ❌    |
| `DaemonClientOptions.*`              | 全部保留，新增 `transport`             |    ❌    |
| `DaemonHttpError`                    | 不变                                   |    ❌    |
| `DaemonSessionClient`                | 零变更（委托给 DaemonClient）          |    ❌    |
| 所有类型导出（100+）                 | 不变                                   |    ❌    |

### 每个消费者的影响

| 消费者                       | 影响                                  |
| ---------------------------- | ------------------------------------- |
| webui（25 个文件）           | 零代码变更                           |
| web-shell（4 个文件）        | 零代码变更                           |
| vscode-ide-companion（1 个文件）| 零代码变更                           |
| 第三方                       | REST 用户零变更；传入 `transport` 以使用 ACP |

---

## 4. 设计决策

| 决策                                           | 理由                                                                                                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 在 transport 上提供 `subscribeEvents`，而不是只有 `fetch` | 通过 fetch 重新编码 SSE 既浪费又脆弱                                                                                                                                   |
| transport 上的 `connected: boolean`            | 提供者重连循环需要区分“传输层死亡”与“瞬态 500”                                                                                                                         |
| 延迟初始化（而不是显式 `connect()`）           | 保持 DaemonClient 构造同步；默认的 `new RestSseTransport()` 无需初始化                                                                                                 |
| 自动检测是一次性的，而不是在会话中             | `negotiate()` 在启动时探测一次；运行时回退是消费者驱动的（通过 `DaemonTransportClosedError`），而不是静默内部切换                                                      |
| 不需要错误分类前提                             | ACP 传输层内部将错误映射为 HTTP 等价的状态码；`DaemonHttpError` 按原样工作                                                                                             |
| 提供者获得 `transport` 属性                    | `DaemonWorkspaceProvider` 新增可选的 `transport` 属性（约 5 行），传递给 `DaemonClient` 构造函数。第三方设置此属性；省略时 = 当前 REST 行为                          |

---

## 5. 考虑的替代方案

### 5.1 自定义 fetch 注入（无新接口）

通过现有的 `DaemonClientOptions.fetch` 传递基于 WS 的 `fetch`。

**已拒绝**：`subscribeEvents` 验证 `content-type: text/event-stream` 并使用 `parseSseStream`。自定义 fetch 必须将 WS 帧重新编码为 SSE 文本，然后 SDK 再解码回来 — 浪费的编码-解码往返。此外，`capabilities()` 和 `initialize` 具有不同的响应形状，需要格式映射层。

### 5.2 完整正式接口（4 个 PR，约 2750 行）

错误分类 → 接口 → AcpHttp → AcpWs 作为单独的 PR。

**已拒绝**：过度设计。错误分类是不必要的（ACP 传输层可以映射为 HTTP 等价的状态码）。对于单个内聚的抽象，单独的 PR 会增加审查上下文切换成本。

### 5.3 具有 BridgeContext 的双提供者

并行的 `AcpSessionProvider` + `ChatBridgeContext` + `SessionBridgeContext`。

**已拒绝**：导致存储不同步，需要约 8 个文件，没有 SDK 变更就无法工作。

---

## 6. 实现计划（单个 PR）

所有变更在一个 PR 中落地。预计总约 1300 行。

| 文件                                                              | 变更                                                                   | 行数     |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| `packages/sdk-typescript/src/daemon/DaemonTransport.ts`           | 接口 + 类型 + `DaemonTransportClosedError` + `negotiate()` 工厂方法    | ~110     |
| `packages/sdk-typescript/src/daemon/RestSseTransport.ts`          | 包装 `globalThis.fetch` + 从 DaemonClient 提取的 SSE 逻辑              | ~80      |
| `packages/sdk-typescript/src/daemon/AcpWsTransport.ts`            | WS 复用器 + URL→JSON-RPC 映射 + 请求关联                               | ~400     |
| `packages/sdk-typescript/src/daemon/AcpHttpTransport.ts`          | POST /acp + 连接/会话 SSE 管理                                         | ~300     |
| `packages/sdk-typescript/src/daemon/AcpEventDenormalizer.ts`      | JSON-RPC 通知 → DaemonEvent 映射                                       | ~150     |
| `packages/sdk-typescript/src/daemon/AutoReconnectTransport.ts`    | 可选包装器：重连 + 回退                                                | ~150     |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`              | 构造函数 + 6 个 `_fetch` 位置 + subscribeEvents 重写                   | ~40 净   |
| `packages/sdk-typescript/src/daemon/index.ts`                     | 导出新类型                                                             | ~10      |
| `packages/cli/src/serve/server.ts`                                | 向 `GET /capabilities` 添加 `transports` 字段                          | ~5       |
| `packages/sdk-typescript/src/daemon/types.ts`                     | 向 `DaemonCapabilities` 类型添加 `transports`                          | ~3       |
| `packages/webui/src/daemon/workspace/DaemonWorkspaceProvider.tsx` | 添加可选的 `transport` 属性，传递给 `DaemonClient`                     | ~5       |
| 测试                                                              | 传输层单元测试 + 集成测试                                              | ~200     |

**向后兼容性**：不带 `transport` 的 `new DaemonClient({ baseUrl, token })` = 与现有 REST+SSE 行为相同。所有现有测试无需更改即可通过。

---

## 7. 验证

1. **向后兼容**：在 sdk-typescript 和 webui 上运行 `npm run test` — 无需测试更改。`new DaemonClient({ baseUrl, token })` = 与现有行为相同。
2. **RestSseTransport 提取**：通过现有测试套件确认位对等价的 SSE 行为。
3. **AcpWsTransport**：通过 WS 连接到真实 daemon 的集成测试。验证：
   - `subscribeEvents` 生成与 REST SSE 相同的 `DaemonEvent` 形状
   - prompt 的 202/200 分支使用合成的 Response 正常工作
   - permission 投票往返正确
   - WS 断开时 `connected` 转换为 `false`
   - prompt 上的 abort signal → WS 发送 session/cancel RPC
4. **AcpHttpTransport**：与 WS 相同的验证，但通过 HTTP+SSE。
5. **自动检测**：`negotiate()` 返回最佳传输层；WS 失败时回退到 REST。
6. **运行时回退**：`AutoReconnectTransport` 捕获 `DaemonTransportClosedError`，重建传输层，消费者调用 `session/load` 进行重新同步。
7. **提供者**：带有 `transport` 属性的 `DaemonWorkspaceProvider` — ChatView 和 TerminalView 都从单个存储读取。
8. **端到端**：第三方将 `transport={new AcpWsTransport(url, token)}` 传递给 `DaemonWorkspaceProvider`。所有 SDK hooks 和转录存储保持不变。
---

## 8. 风险

| 风险                                       | 缓解措施                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| URL→JSON-RPC 映射表维护                     | 表与传输层同位置存放；守护进程路由变更时需同步更新传输层                                                               |
| ACP WS 合成响应保真度                       | 提供 `syntheticResponse(status, json)` 辅助方法；明确约定响应契约（`.json()`、`.text()`、`.status`、`.body?.cancel()`） |
| WS 中 `DaemonEvent.id` 的单调性             | ACP 服务器的 JSON-RPC 通知携带事件 ID；传输层直接透传                                                                  |
| WS 返回 202 与 200 的提示                   | 传输层将 JSON-RPC 响应映射为 200 并携带结果体（阻塞路径）；事件仍通过 `subscribeEvents` 传送                          |
| WS 连接断开检测                             | 通过 `connected: boolean` 以及 `fetch` 抛出的 `DaemonTransportClosedError` 实现                                        |