# DaemonTransport 抽象层

> 目标分支：`main`。作者：arnoo.gao。日期：2026-06-12。状态：**设计 v4 — 评审中**。
> 遵循 design-first 的仓库工作流：本文档在实现 PR 之前落地。

---

## 0. TL;DR

`DaemonClient` 硬编码了 REST+SSE。希望使用 ACP WebSocket 的第三方集成需要 fork 整个 provider 层（约 8 个文件）。本提案新增一个 **`DaemonTransport` 接口**，包含 `fetch` + `subscribeEvents` 方法，以及自动检测和运行时回退能力，从而实现可插拔的传输层，同时**零破坏性变更**。

**总变更量：约 1300 行**，通过单个实现 PR 完成。现有消费方无需改动 —— `new DaemonClient({ baseUrl, token })` = 当前行为不变。

---

## 1. 背景

### 1.1 当前架构

```
DaemonClient({ baseUrl, token })
  └─ this._fetch = globalThis.fetch     ← 硬编码
  └─ subscribeEvents → GET /session/:id/events → parseSseStream → DaemonEvent
```

67 个公开方法，每个方法各自构建 REST URL 并根据 HTTP 状态码分支处理。`fetch` 已可通过 `DaemonClientOptions.fetch` 注入，但 `subscribeEvents` 内部包含 SSE 专属逻辑（content-type 校验、SSE 解析、连接阶段超时），仅靠 fetch 注入无法替换。

### 1.2 第三方面临的问题

当第三方（例如 `agent-web`）构建 `AcpSessionProvider` 以使用 WebSocket 替代 REST+SSE 时：

- **替换 `DaemonSessionProvider`**：读取 `DaemonStoreContext` 的组件（如 TerminalView）会丢失上下文 → 崩溃。
- **同时保留两个 provider**：两个事件源、两个 store，产生数据不同步。
- **向 SDK store 注入事件**：`DaemonSessionProvider` 内部同时订阅 SSE → 产生重复事件。

**根本原因**：更换传输层需要替换 provider，因为 `DaemonClient` 的 `subscribeEvents` 硬编码为 SSE。

### 1.3 目标

```
DaemonClient({ transport: new AcpWsTransport(url, token) })
  └─ transport.fetch → 将 URL+verb 映射为 WS 上的 JSON-RPC
  └─ transport.subscribeEvents → 对 WS 通知按 sessionId 解复用 → DaemonEvent
```

单一 provider，单一 store，传输层作为内部实现细节。第三方将 `transport` 传入 `DaemonClient`，其余一切保持不变。

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
   * 契约：
   * - Response 必须支持 .json()、.text()、.ok、.status、
   *   .headers.get()、.body?.cancel()
   * - .status 必须是准确的 HTTP 状态码
   *   （200、201、202、204、404 等）
   * - 错误响应体必须保留 daemon 的结构化格式
   * - 无需预先 setup 即可调用；传输层内部处理初始化
   *   （懒初始化 / init-once 延迟模式）
   * - 连接断开时抛出 DaemonTransportClosedError
   * - 当 init.signal 中止时：对于 prompt 请求，传输层必须
   *   在链路上取消正在进行的 prompt（WS：发送 session/cancel
   *   RPC；HTTP：中止 fetch）。对于普通请求，中止仅
   *   拒绝/取消待处理请求，无副作用。
   *   待处理的响应以 AbortError 拒绝。
   */
  fetch(
    url: string,
    init: RequestInit,
    opts?: DaemonTransportFetchOptions,
  ): Promise<Response>;

  /**
   * 订阅 session 事件。
   *
   * 契约：
   * - 带有 id 的事件必须具有单调递增的整数 id；合成/终止
   *   帧（如 stream_error）可以省略 id（DaemonEvent.id 为可选）
   * - 必须在单个流中传递所有事件类型（session + workspace）
   * - 中止 signal 必须只停止当前 generator，不影响连接
   * - 连接断开时，所有待处理的 generator 必须抛出
   *   DaemonTransportClosedError（传输层维护 generator 引用）
   * - 必须仅对连接阶段应用 connectTimeoutMs
   * - 传输层必须声明是否支持 lastEventId 回放；
   *   若不支持，消费方在重连时必须使用 session/load 进行完整重同步
   */
  subscribeEvents(
    sessionId: string,
    opts: DaemonTransportSubscribeOptions,
  ): AsyncGenerator<DaemonEvent>;

  /** 传输层标识，用于穷举 switch。 */
  readonly type: 'rest' | 'acp-http' | 'acp-ws';

  /** 本传输层是否支持基于 Last-Event-ID 的断线重连回放。
   *  为 false 时，消费方必须使用 session/load 进行完整重同步。 */
  readonly supportsReplay: boolean;

  /** 连接断开或 dispose() 后为 false。 */
  readonly connected: boolean;

  /** 幂等清理。 */
  dispose(): void;
}

class DaemonTransportClosedError extends Error {}
```

### 2.2 为何需要两个方法（fetch + subscribeEvents），而不仅仅是 fetch

`subscribeEvents` 在不同传输层上具有根本不同的链路语义：

| 传输层    | 链路机制                                                           |
| --------- | ------------------------------------------------------------------ |
| REST      | `GET /session/:id/events` → SSE → `parseSseStream` → `DaemonEvent` |
| ACP HTTP  | `GET /acp`（session 级别 SSE）→ JSON-RPC 通知解包                  |
| ACP WS    | 按 sessionId 对共享 socket 的通知进行解复用                        |

强行通过 fetch 形状来承载这些语义，需要 SSE 重编码/解码（WS → 伪造 SSE 文本 → `parseSseStream` → DaemonEvent）—— 既浪费又脆弱。

其余 66 个方法都通过 `fetch` 处理，因为无论哪种传输层，它们都遵循请求→响应语义。

### 2.3 为何选择 fetch 级别，而非方法分发

DaemonClient 的 67 个方法包含各自的 HTTP 分支逻辑：

- `prompt()`：202 vs 200 状态码判断
- `deleteWorkspaceAgent()`：204 vs 带响应体的 404
- `respondToPermission()`：200 vs 404 用于竞态检测
- 6 个方法绕过 `fetchWithTimeout` 直接调用 `_fetch`

方法分发接口（`request<T>(method, params)`）需要在每个传输层中重复所有这些逻辑。fetch 级别的方式则保持 DaemonClient 不变。

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
- 6 处直接调用 `this._fetch` 的位置（prompt、promptNonBlocking、recapSession、
  btwSession、shellCommand、subscribeEvents）：替换为
  `this.transport.fetch(url, init, { timeout: 0 })`
- `subscribeEvents`：对 `this.transport.type` 做穷举 switch：
  - `'rest'`：委托给 `this.transport.subscribeEvents(sessionId, opts)`
  - 其他：同样委托（每个传输层处理自己的链路格式）
- 移除 `private _fetch` 字段（由 transport 替代）

### 2.5 Provider 注入点

`DaemonWorkspaceProvider` 和 `DaemonSessionProvider` 都在内部构造 `DaemonClient`。为让第三方在不绕过 provider 的情况下注入 transport：

```typescript
// DaemonWorkspaceProvider — 新增可选 transport prop
interface DaemonWorkspaceProviderProps {
  baseUrl: string;
  token?: string;
  transport?: DaemonTransport; // 新增 — 转发给 DaemonClient
  // ...现有 props
}

// DaemonSessionProvider — 继承自 workspace context
// 无需 transport prop；从 workspace context 读取
```

提供 `transport` 时，provider 将其传递给 `DaemonClient`：

```typescript
new DaemonClient({ baseUrl, token, transport: props.transport });
```

省略时：当前行为（REST+SSE）。provider 变更约 5 行。

### 2.5 RestSseTransport（约 80 行）

封装 `globalThis.fetch` 并提取 `DaemonClient.subscribeEvents` 中的当前 SSE 逻辑：

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
    // 当前 DaemonClient.subscribeEvents 的逻辑迁移至此：
    // - 从 this.baseUrl + sessionId 构建 URL
    // - 从 this.token 设置 Authorization header
    // - 从 opts.connectTimeoutMs 设置连接阶段超时
    // - fetch → 校验 content-type → parseSseStream → yield
  }

  dispose() {} // 空操作
}
```

### 2.6 ACP 传输层内部实现

**AcpWsTransport**（约 400-600 行）：

- 懒初始化：第一次 `fetch` 调用时打开 WS 并发送 `initialize`
- URL→JSON-RPC 映射表：`/session/:id/prompt` → `{method: "session/prompt", params: {sessionId: id, ...body}}`
- 请求多路复用器：`Map<id, {resolve, reject}>` 存储待处理请求
- `subscribeEvents`：按 sessionId 过滤共享通知流
- `connected`：跟踪 WS readyState
- `supportsReplay`：false（WS 不支持 Last-Event-ID；消费方须调用 `session/load`）
- 合成带有正确 `.status`/`.json()`/`.text()` 的 `Response` 对象

**AcpHttpTransport**（约 800-1000 行）：

- 懒初始化：第一次 `fetch` 调用时发送 `POST /acp {initialize}`
- 内部管理连接级别和 session 级别的 SSE 流
- 相同的 URL→JSON-RPC 映射 + 请求关联
- `supportsReplay`：true（session SSE 支持 Last-Event-ID）

### 2.7 传输层自动检测

服务端在 `GET /capabilities` 中声明支持的传输层：

```json
{
  "transports": ["rest+sse", "acp-http+sse", "acp-ws"],
  ...现有 capabilities 字段...
}
```

SDK 提供一次性静态工厂方法：

```typescript
// 在 React 渲染前探测一次，session 中途不切换
const transport = await DaemonTransport.negotiate(baseUrl, token);
// 返回最优可用项：acp-ws > acp-http > rest（兜底）
```

实现步骤：

1. `GET /capabilities` → 读取 `transports` 数组
2. 若列表中有 `acp-ws` → 尝试 WS 升级；成功则返回 `AcpWsTransport`
3. 若 WS 失败或不在列表中 → 尝试 `acp-http`；成功则返回 `AcpHttpTransport`
4. 兜底 → `RestSseTransport`

不影响任何现有 API：`GET /capabilities` 新增字段（向后兼容），现有消费方会忽略未知字段。

### 2.8 运行时回退（WS → REST 断线时）

当非 REST 传输层在 session 中途断开时：

```
AcpWsTransport (connected=true)
  │
  ├── WS 断开（网络中断、服务重启、空闲超时）
  │
  ├── connected = false
  ├── 所有待处理的 fetch() 调用 → 以 DaemonTransportClosedError 拒绝
  ├── 所有 subscribeEvents generator → 抛出 DaemonTransportClosedError
  │
  └── 消费方（Provider / 第三方）检测到断线：
        1. 创建新的 RestSseTransport（daemon 在线时必定可用）
        2. 创建新的 DaemonClient({ transport: newTransport })
        3. 对每个活跃 session：通过 session/load 重新附加
        4. 恢复事件订阅
```

**关键约束**：运行时回退是**由消费方驱动的，而非传输层内部的**。传输层不会静默切换协议 —— 它会明确失败（抛出 `DaemonTransportClosedError`），由消费方决定是否重建。

原因：

- WS 断开会在服务端销毁所有归属的 session（`registry.delete` → `conn.destroy`）。静默切换会隐藏这一数据丢失。
- `session/load` 可重新附加到已有的 bridge session（保留历史记录），但正在进行的 prompt 会被中止。消费方必须显式处理这一情况（重试或向用户展示）。
- 目前尚不支持跨传输层的 `Last-Event-ID` 续传（第 4 阶段）。断线到重连之间的事件可能丢失。消费方应通过 `session/load` 请求完整的状态重同步（该方法会回放历史记录）。

**AutoReconnectTransport**（约 150 行，可选封装）：

```typescript
class AutoReconnectTransport implements DaemonTransport {
  constructor(
    private baseUrl: string,
    private token: string,
    private preferred: 'acp-ws' | 'acp-http' | 'rest',
  ) {}

  // 当内部传输层抛出 DaemonTransportClosedError 时：
  // 1. 尝试重新创建首选传输层
  // 2. 若首选失败，回退到 REST
  // 3. 重新初始化连接
  // 调用方仍需调用 session/load —— 此封装仅处理
  // 传输层级别的重连，而非 session 级别。
}
```

此封装为可选项。不需要自动重连的现有消费方只需捕获 `DaemonTransportClosedError` 并自行处理。

**对现有功能的影响**：零。所有自动检测和回退代码均为增量新增且按需使用。不带 `transport` 的 `new DaemonClient({ baseUrl, token })` = 当前 REST 行为，无自动检测，无回退逻辑。

---

## 3. 破坏性变更审查

### 结论：零破坏性变更

| 公开 API                               | 变更                                     | 是否破坏？ |
| -------------------------------------- | ---------------------------------------- | :-------: |
| `new DaemonClient({ baseUrl, token })` | 无变更                                   |    ❌     |
| `DaemonClientOptions.*`                | 全部保留，新增 `transport`               |    ❌     |
| `DaemonHttpError`                      | 无变更                                   |    ❌     |
| `DaemonSessionClient`                  | 零变更（委托给 DaemonClient）            |    ❌     |
| 所有类型导出（100+）                   | 无变更                                   |    ❌     |

### 各消费方影响

| 消费方                        | 影响                                    |
| ----------------------------- | --------------------------------------- |
| webui（25 个文件）            | 零代码变更                              |
| web-shell（4 个文件）         | 零代码变更                              |
| vscode-ide-companion（1 个文件）| 零代码变更                            |
| 第三方                        | REST 用户零变更；ACP 用户传入 `transport` |

---

## 4. 设计决策

| 决策                                             | 理由                                                                                                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 在传输层上定义 `subscribeEvents`，而非仅用 `fetch` | 通过 fetch 重编码 SSE 既浪费又脆弱                                                                                                                                         |
| 传输层上的 `connected: boolean`                   | Provider 的重连循环需要区分"传输层断线"与"偶发的 500 错误"                                                                                                                 |
| 懒初始化（不使用显式 `connect()`）                | 保持 DaemonClient 构造为同步操作；默认的 `new RestSseTransport()` 无需初始化                                                                                               |
| 自动检测为一次性，而非 session 中途触发           | `negotiate()` 在启动时探测一次；运行时回退由消费方通过 `DaemonTransportClosedError` 驱动，而非内部静默切换                                                                 |
| 无错误分类前提条件                                | ACP 传输层在内部将错误映射为等效 HTTP 状态码；`DaemonHttpError` 可直接复用                                                                                                 |
| Provider 获得 `transport` prop                    | `DaemonWorkspaceProvider` 新增可选 `transport` prop（约 5 行），转发给 `DaemonClient` 构造函数。第三方设置此 prop；省略则 = 当前 REST 行为                                 |

---

## 5. 已考虑的替代方案

### 5.1 自定义 fetch 注入（不引入新接口）

通过现有 `DaemonClientOptions.fetch` 传入基于 WS 的 `fetch`。

**已拒绝**：`subscribeEvents` 会校验 `content-type: text/event-stream` 并使用 `parseSseStream`。自定义 fetch 必须将 WS 帧重编码为 SSE 文本，然后 SDK 再解码 —— 造成无谓的编解码往返。此外，`capabilities()` 和 `initialize` 的响应格式不同，需要额外的格式映射层。

### 5.2 完整正式接口（4 个 PR，约 2750 行）

将错误分类 → 接口 → AcpHttp → AcpWs 分为独立 PR。

**已拒绝**：过度工程化。错误分类没有必要（ACP 传输层可以映射为等效 HTTP 状态码）。拆分 PR 增加了对单一内聚抽象的评审上下文切换成本。

### 5.3 双 Provider + BridgeContext

并行使用 `AcpSessionProvider` + `ChatBridgeContext` + `SessionBridgeContext`。

**已拒绝**：导致 store 数据不同步，需修改约 8 个文件，且在没有 SDK 变更的情况下无法工作。

---

## 6. 实现计划（单个 PR）

所有变更在一个 PR 中落地。预计总计约 1300 行。

| 文件                                                              | 变更                                                                     | 行数    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ------- |
| `packages/sdk-typescript/src/daemon/DaemonTransport.ts`           | 接口 + 类型 + `DaemonTransportClosedError` + `negotiate()` 工厂          | ~110    |
| `packages/sdk-typescript/src/daemon/RestSseTransport.ts`          | 封装 `globalThis.fetch` + 从 DaemonClient 提取的 SSE 逻辑               | ~80     |
| `packages/sdk-typescript/src/daemon/AcpWsTransport.ts`            | WS 多路复用器 + URL→JSON-RPC 映射 + 请求关联                             | ~400    |
| `packages/sdk-typescript/src/daemon/AcpHttpTransport.ts`          | POST /acp + 连接/session SSE 管理                                        | ~300    |
| `packages/sdk-typescript/src/daemon/AcpEventDenormalizer.ts`      | JSON-RPC 通知 → DaemonEvent 映射                                         | ~150    |
| `packages/sdk-typescript/src/daemon/AutoReconnectTransport.ts`    | 可选封装：重连 + 回退                                                    | ~150    |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`              | 构造函数 + 6 处 `_fetch` 调用 + subscribeEvents 重写                     | 净 ~40  |
| `packages/sdk-typescript/src/daemon/index.ts`                     | 导出新类型                                                               | ~10     |
| `packages/cli/src/serve/server.ts`                                | 在 `GET /capabilities` 响应中新增 `transports` 字段                      | ~5      |
| `packages/sdk-typescript/src/daemon/types.ts`                     | 在 `DaemonCapabilities` 类型中新增 `transports`                          | ~3      |
| `packages/webui/src/daemon/workspace/DaemonWorkspaceProvider.tsx` | 新增可选 `transport` prop，转发给 `DaemonClient`                         | ~5      |
| 测试                                                              | 传输层单元测试 + 集成测试                                                | ~200    |

**向后兼容性**：不带 `transport` 的 `new DaemonClient({ baseUrl, token })` = 相同的 REST+SSE 行为。所有现有测试无需修改即可通过。

---

## 7. 验证

1. **向后兼容**：在 sdk-typescript 和 webui 上运行 `npm run test` —— 无需修改任何测试。`new DaemonClient({ baseUrl, token })` = 行为完全相同。
2. **RestSseTransport 提取**：通过现有测试套件确认 SSE 行为与原来逐位等同。
3. **AcpWsTransport**：通过 WS 连接真实 daemon 的集成测试。验证：
   - `subscribeEvents` 产出与 REST SSE 相同的 `DaemonEvent` 结构
   - prompt 202/200 分支在合成 Response 下正常工作
   - permission 投票能正确往返
   - WS 断开时 `connected` 转变为 `false`
   - prompt 上的中止 signal → WS 发送 session/cancel RPC
4. **AcpHttpTransport**：与 WS 相同的验证内容，但通过 HTTP+SSE 进行。
5. **自动检测**：`negotiate()` 返回最优传输层；WS 失败时回退到 REST。
6. **运行时回退**：`AutoReconnectTransport` 捕获 `DaemonTransportClosedError`，重建传输层，消费方调用 `session/load` 进行重同步。
7. **Provider**：带 `transport` prop 的 `DaemonWorkspaceProvider` —— ChatView + TerminalView 均从单一 store 读取。
8. **端到端**：第三方将 `transport={new AcpWsTransport(url, token)}` 传递给 `DaemonWorkspaceProvider`。所有 SDK hooks 和 transcript store 工作正常，无需变更。

---

## 8. 风险

| 风险                                   | 缓解措施                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| URL→JSON-RPC 映射表维护                | 映射表与传输层代码放在一起；daemon 路由变更时需同步更新传输层                                                         |
| ACP WS 合成 Response 的保真度          | 提供 `syntheticResponse(status, json)` 辅助函数；明确约定（`.json()`、`.text()`、`.status`、`.body?.cancel()`）        |
| WS 的 `DaemonEvent.id` 单调性          | ACP 服务端的 JSON-RPC 通知携带事件 id；传输层直接透传                                                                 |
| WS 的 Prompt 202 vs 200                | 传输层将 JSON-RPC 响应映射为带结果体的 200（阻塞路径）；事件仍通过 `subscribeEvents` 流式传输                         |
| WS 连接断线检测                        | `connected: boolean` + `fetch` 抛出 `DaemonTransportClosedError`                                                       |
