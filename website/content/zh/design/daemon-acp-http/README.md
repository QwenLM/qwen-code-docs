# Daemon ACP-over-HTTP → 官方 ACP Streamable HTTP 传输层

> 目标分支：`daemon_mode_b_main`。Feature 分支：`feat/daemon-acp-http-streamable`。
> 作者：arnoo.gao。日期：2026-05-24。状态：**设计 v1 → 实现**。
> 遵循仓库 design-first 工作流：本文档在实现 PR 之前或与其同步落地，以便 wire 协议合约可供审查。

---

## 0. TL;DR

当前 daemon（`qwen serve`）对 web/SDK 客户端使用一套**私有 REST + SSE** 方言通信，对内部 spawn 的 `qwen --acp` 子进程则使用**真正的 ACP JSON-RPC over stdio**。本提案新增一条**第二条 northbound 传输通道**，在单一 `/acp` 端点实现**官方 ACP Streamable HTTP 传输层**（RFD #721），使任何原生 ACP 客户端（Zed、Goose、未来的 SDK）都能通过标准协议直接驱动 daemon，无需了解 qwen 专有 REST 知识。

**决策：双传输层，叠加式。** 新增 `/acp` 端点与现有 REST 路由共存，复用同一套 `HttpAcpBridge` + `EventBus`。REST API **不删除**。理由见 §6。

**决策：扩展命名空间 = `_qwen/…`**（单下划线前缀，ACP 规范预留给自定义方法的形式），用于 daemon 中没有对应标准 ACP 方法的功能（模型切换、工作区自省、心跳、多客户端权限策略、SSE 背压调整）。理由见 §5。

本 PR 附带一个完整、可本地运行的参考实现（`packages/cli/src/serve/acp-http/`）及验证脚本（`scripts/acp-http-smoke.mjs`）。

---

## 1. 背景——"ACP over HTTP" 现状

三层架构（在 commit `0c0430939` 处验证）：

```
┌──────────────┐  bespoke REST + SSE (HTTP/1.1)   ┌────────────┐  ACP JSON-RPC   ┌──────────────┐
│ web / SDK    │ ───────────────────────────────► │  qwen      │  (stdio NDJSON) │ qwen --acp   │
│ client       │ ◄─── GET /session/:id/events ──── │  serve     │ ◄─────────────► │ child (Agent)│
│ (ACP client) │       (text/event-stream)        │  (daemon)  │  ndJsonStream   │              │
└──────────────┘                                   └────────────┘                 └──────────────┘
        northbound: 非 ACP wire 协议                   bridge          southbound: 真正的 ACP
```

### 1.1 Northbound（客户端 ↔ daemon）——当前为私有协议

- Express 5 应用位于 `packages/cli/src/serve/server.ts`（约 30 条路由）。
- 独立 REST 动词，**不是** JSON-RPC：
  - `POST /session`（创建）、`POST /session/:id/prompt`、`POST /session/:id/cancel`、
    `POST /session/:id/load|resume`、`POST /session/:id/model`、
    `POST /session/:id/permission/:requestId`、`POST /session/:id/heartbeat`、
    `DELETE /session/:id`，以及 `/workspace/*`、`/capabilities`、`/health`。
- 服务端→客户端流式传输：`GET /session/:id/events` → `text/event-stream`。
  - 帧格式：`id: <n>\nevent: <type>\ndata: <json>\n\n`（`server.ts:formatSseFrame`，约第 2626 行）。
  - 每个 session 维护**单调递增 `id`** + `Last-Event-ID` 续传，由环形缓冲 `EventBus`（`acp-bridge/src/eventBus.ts`）支撑。
  - 事件 `type`：`session_update`、`client_evicted`、`slow_client_warning`、
    `state_resync_required`、`stream_error` 等。
- 鉴权：`Authorization: Bearer <token>`（`serve/auth.ts`），CORS 拒绝 + host 白名单。
- 背压：每连接序列化写入链 + 15 秒心跳注释。

### 1.2 Southbound（daemon ↔ 子进程）——已经是 ACP

- `acp-bridge/src/spawnChannel.ts` 启动 `qwen --acp`，用来自 `@agentclientprotocol/sdk`（`^0.14.1`）的 `ndJsonStream` 包装 stdin/stdout。
- `acp-bridge/src/bridge.ts:729` 处 `new ClientSideConnection(() => client, channel.stream)`
  —— daemon 是 ACP **client**，子进程是 ACP **agent**。
- 该通道已使用的扩展方法：`unstable_setSessionModel`、
  `unstable_resumeSession`、`unstable_listSessions`（`acp-integration/acpAgent.ts`）。

### 1.3 为何迁移 northbound

- 每个客户端（webui、TS SDK、Java SDK、Python SDK、VSCode companion）都要重新实现私有 REST 映射。标准 ACP 端点让原生 ACP 编辑器无需任何 qwen 专有胶水代码即可接入。
- 使 daemon 对外的远程接口与其内部已在使用的协议保持一致。

---

## 2. 目标：ACP Streamable HTTP（RFD #721）

已合并的 **Draft** RFD（`agentclientprotocol/agent-client-protocol#721`，2026-04-22 合并）。尚未规范化，尚未进入任何 SDK。我们针对 RFD wire 设计进行实现。

### 2.1 端点与动词（单一 `/acp`）

| 动词          | 行为                                                                                                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /acp`   | 发送 JSON-RPC。`initialize` → **`200`** + JSON body（能力信息），并设置 `Acp-Connection-Id`。所有其他请求/通知 → **`202 Accepted`**，空 body；响应（如有）通过对应的长连接 SSE 流下发。 |
| `GET /acp`    | 打开长连接 **SSE** 流。（`Upgrade: websocket` → WebSocket；**延后实现**，见 §7。）                                                                                                                                                              |
| `DELETE /acp` | 终止连接 → `202`。                                                                                                                                                                                                                              |

### 2.2 两层长连接流

- **连接级流**：`GET /acp` 携带 `Acp-Connection-Id` header，不带 session header。承载连接级响应（`session/new`、`session/load`、`authenticate`）和连接级通知。
- **Session 级流**：`GET /acp` 同时携带 `Acp-Connection-Id` **和** `Acp-Session-Id`。承载 `session/update` 通知、**agent→client 请求**（`session/request_permission`、`fs/read_text_file` 等）以及 session POST 的响应（`session/prompt`、`session/cancel`）。

### 2.3 身份（3 层）

- `Acp-Connection-Id`（HTTP header）—— 传输绑定，在 `initialize` 时生成。
- `Acp-Session-Id`（HTTP header）—— session 级 GET 和 session POST 必须携带。
- `sessionId`（JSON-RPC 参数）—— 在方法参数内部（必须与 header 一致）。

### 2.4 与 MCP StreamableHTTP 的差异

ACP 使用**长连接**流（非按请求 SSE）、**两个** ID header（连接 vs session）、非 initialize 请求返回 `202`，并要求 HTTP/2 和客户端支持 WebSocket。我们借鉴了单端点 + POST/GET-SSE + session header 的骨架，但适配了长连接双 ID 模型。我们**不复用** `@modelcontextprotocol/sdk` 的 `StreamableHTTPServerTransport`（其按请求流模型和单 `Mcp-Session-Id` 不适配）。

### 2.5 标准方法（从当前 schema 确认）

- Client→Agent 请求：`initialize`、`authenticate`、`session/new`、`session/load`、
  `session/prompt`、`session/resume`、`session/close`、`session/list`、
  `session/set_mode`、`session/set_config_option`、`logout`。
- Client→Agent 通知：`session/cancel`。
- Agent→Client 请求：`fs/read_text_file`、`fs/write_text_file`、
  `session/request_permission`、`terminal/create|output|wait_for_exit|kill|release`。
- Agent→Client 通知：`session/update`。

---

## 3. 新传输层架构

daemon 必须对 northbound 呈现 **ACP Agent over HTTP** 接口，同时对 southbound 子进程保持 ACP **client** 角色。`/acp` 层因此是一个 **JSON-RPC 路由器**，负责终止 HTTP 传输并桥接进现有的 `HttpAcpBridge`。

```
            POST /acp (JSON-RPC requests/responses/notifs)
client  ──────────────────────────────────────────────►  ┌───────────────────────────┐
(editor)                                                  │  AcpHttpTransport         │
        ◄── GET /acp  (connection-scoped SSE) ──────────  │  - connection registry    │
        ◄── GET /acp  (session-scoped SSE) ─────────────  │  - JSON-RPC id correlation│
                                                          │  - method dispatch        │
                                                          └────────────┬──────────────┘
                                                                       │ reuses
                                                          ┌────────────▼──────────────┐
                                                          │  HttpAcpBridge + EventBus  │  (unchanged)
                                                          └────────────┬──────────────┘
                                                                       │ ACP stdio (unchanged)
                                                                 qwen --acp child
```

### 3.1 新模块布局（`packages/cli/src/serve/acp-http/`）

| 文件                     | 职责                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`               | `mountAcpHttp(app, bridge, opts)` —— 在现有 Express app 上注册 `/acp` 路由。                                                                                                               |
| `connection-registry.ts` | `Acp-Connection-Id` → `AcpConnection`（连接 SSE writer、`Map<sessionId, SessionStream>`、按 JSON-RPC id 记录的待处理 agent→client 请求、单调 id 分配器）。TTL + DELETE 清理。              |
| `json-rpc.ts`            | JSON-RPC 2.0 解析/校验/序列化工具；错误码（`-32600` 等）；`_qwen/` 命名空间守卫。                                                                                                         |
| `dispatch.ts`            | 将入站 JSON-RPC 方法映射到 `HttpAcpBridge` 调用；将 `BridgeEvent` 映射为出站 JSON-RPC 帧。转换表见 §4。                                                                                    |
| `sse-stream.ts`          | 长连接 SSE writer（复用 `server.ts` 的背压/心跳模式）。与 REST `/events` 不同（帧格式不同：完整 JSON-RPC 对象，而非 qwen 事件信封）。                                                      |

不修改 `bridge.ts` / `eventBus.ts`（仅作叠加式消费者）。

### 3.2 连接与 session 生命周期

1. `POST /acp {initialize}` → 生成 `connectionId`，创建 `AcpConnection`，返回 `200` 携带 `{protocolVersion, agentCapabilities, _meta:{qwen:{…}}}` + `Acp-Connection-Id` header。
2. 客户端打开 `GET /acp`（连接级），携带 `Acp-Connection-Id`。
3. `POST /acp {session/new}` → `202`；daemon 调用 `bridge.createSession(...)`；将 JSON-RPC 响应（含 `sessionId`）推送到**连接级**流。
4. 客户端打开 `GET /acp`（session 级），携带 `Acp-Connection-Id` + `Acp-Session-Id`；daemon 调用 `bridge.subscribeEvents(sessionId)` 并管道传输转换后的帧。
5. `POST /acp {session/prompt}` → `202`；`bridge.sendPrompt(...)`；`session/update` 通知在 session 流上实时推送；最终 prompt **响应**（`{id, result:{stopReason}}`）在 settle 后推送到 session 流。
6. Agent→client 请求（例如 `session/request_permission`）以 JSON-RPC **请求**形式在 session 流上发出，使用 daemon 分配的 id；客户端通过 `POST /acp {id, result}` 回复；`dispatch` 通过 bridge 的权限 API 解析。
7. `DELETE /acp`（或连接流关闭 + TTL）拆除 session/订阅。

---

## 4. 转换表（bridge ⇄ ACP/HTTP）

### 4.1 入站（客户端 POST → bridge）

| ACP 方法                                    | Bridge 调用                                           | 响应路由                               |
| ------------------------------------------- | ----------------------------------------------------- | -------------------------------------- | ----------------- |
| `initialize`                                | （无；能力信息来自 `capabilities.ts`）                 | 内联 `200`                             |
| `authenticate`                              | 现有 auth provider（`serve/auth/*`）                   | 连接级流                               |
| `session/new`                               | `bridge.createSession`                                | 连接级流                               |
| `session/load` / `session/resume`           | `bridge.restoreSession('load'                         | 'resume')`                             | 连接级流 |
| `session/prompt`                            | `bridge.sendPrompt`                                   | session 级流（延迟至 settle）          |
| `session/cancel`（通知）                    | `bridge.cancel`                                       | —                                      |
| `session/list`                              | `bridge.listSessions`（`unstable_listSessions`）      | 连接级流                               |
| `session/set_mode`                          | 审批模式路由逻辑                                       | session 级流                           |
| JSON-RPC **响应**（响应 agent→client 请求） | 解析 pending（§4.3）                                   | —                                      |
| `_qwen/session/set_model`                   | `bridge.setSessionModel`（`unstable_setSessionModel`） | session 级流                           |
| `_qwen/workspace/list` 等                   | 工作区自省路由                                         | 连接级流                               |
| `_qwen/session/heartbeat`                   | `bridge.heartbeat`                                    | 连接级流                               |

### 4.2 出站（BridgeEvent → session 流上的 JSON-RPC）

| BridgeEvent.type                                                   | 发出形式                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `session_update`                                                   | `{method:"session/update", params:<data>}` 通知                    |
| 权限请求                                                           | `{id:<n>, method:"session/request_permission", params}` 请求       |
| `client_evicted` / `slow_client_warning` / `state_resync_required` | `{method:"_qwen/notify", params:{kind,…}}` 通知                    |
| `stream_error`                                                     | 针对活跃 prompt id 的 JSON-RPC 错误响应（或 `_qwen/notify`）       |
| prompt settle                                                      | `{id:<promptId>, result:{stopReason}}`                              |

### 4.3 待处理的 agent→client 请求

`AcpConnection` 维护 `Map<jsonRpcId, {sessionId, kind, bridgeRequestId, resolve}>`。
当客户端 POST 一个 JSON-RPC 响应对象时，`dispatch` 匹配 `id`，然后调用 bridge 的解析路径（例如权限 `POST /session/:id/permission/:requestId` 的内部等价逻辑）。

> **v1 状态：** 仅实现了 `session/request_permission` agent→client 往返。`fs/*` 和 `terminal/*` agent→client 转发**延后处理**（§7）—— daemon 在 `/acp` 上尚未广播 `fs`/`terminal` 客户端能力协商，因此 ACP 客户端不应在 v1 中假设该传输层支持文件系统/终端语义。最终目标（将 `fs/*` 转发给客户端；当客户端缺少 `fs` 能力时回退到 daemon 的工作区 FS）将在 §7 描述的后续工作中实现。

---

## 5. 扩展策略（需求 #2）

ACP 保留所有以 `_` 开头的方法名用于自定义扩展，并在每种类型上提供 `_meta`。代码库 southbound 端已使用 `unstable_*` 方法名。

**Northbound 选择：** 厂商命名空间 **`_qwen/<area>/<verb>`** 方法名（规范兼容的 `_` 前缀）。能力在 `initialize` 时通过 `agentCapabilities._meta.qwen` 广播，客户端可在使用前进行特性检测。

| 需求                                                  | 无对应标准 ACP 方法？ | 扩展                                                    |
| ----------------------------------------------------- | --------------------- | ------------------------------------------------------- |
| 模型切换                                              | 是                    | `_qwen/session/set_model`                               |
| 工作区 MCP/skills/providers/env 自省                  | 是                    | `_qwen/workspace/list`、`_qwen/workspace/<area>`        |
| 心跳/最后活跃时间                                     | 是                    | `_qwen/session/heartbeat`                               |
| 多客户端权限策略（consensus/designated）              | 部分                  | `session/request_permission` + `_meta.qwen.policy`      |
| SSE 背压调整（`maxQueued`）                           | 是                    | `Acp-Qwen-Max-Queued` header（session GET）             |
| 续传游标（环形 `Last-Event-ID`）                      | RFD Phase 4           | `Last-Event-ID` header + 帧上的 `_meta.qwen.eventId`   |

标准方法**绝不**重命名；扩展严格叠加且可忽略。

---

## 6. 双传输层 vs. 替换（需求 #4）

**决策：双传输层（叠加式）。**

- 官方传输层是 **Draft** RFD，尚未规范化，所有 SDK 均未包含——强制替换会将我们与未批准的设计绑定，并一次性破坏 webui + 3 个 SDK + VSCode companion。
- REST 接口承载了尚无 ACP 对应映射的功能（工作区自省、多客户端权限中介、环形缓冲续传、能力注册表）。这些功能在 `/acp` 上降级为 `_qwen/*` 扩展，但在 RFD 批准之前 REST 接口仍是权威来源。
- 两种传输层共享**同一个** `HttpAcpBridge` + `EventBus` 实例，没有状态重复——`/acp` 和 `/session/*` 甚至可以同时驱动同一个实时 session（bridge 已支持多客户端）。
- 开关（v1，已发布）：默认开启；**`QWEN_SERVE_ACP_HTTP=0`** 可禁用挂载。`--no-acp-http` CLI flag 以及 `/capabilities` 中的 `acp_http` 标签（用于客户端特性检测）**延后**至后续 PR（v1 中不包含）——在此之前，客户端通过探测 `POST /acp {initialize}` 来检测传输层。

迁移路径：一旦 RFD 批准且 SDK 发布，REST 路由可重构为 `/acp` 之上的薄兼容层（独立的后续 PR）。

---

## 7. 实现 PR 范围

**在范围内（本地可运行 + 已验证）：**

- `POST /acp` dispatch，涵盖 `initialize`、`session/new`、`session/prompt`、
  `session/cancel`、`session/load`、JSON-RPC 响应处理。
- 连接级 + session 级 `GET /acp` SSE 流，使用 JSON-RPC 帧格式。
- `session/update` 流式传输 + 最终 prompt 响应关联。
- `session/request_permission` agent→client 往返。
- `_qwen/session/set_model` 扩展作为需求 #2 的实现示例。
- Bearer 鉴权 + host 白名单复用（与 REST 相同的中间件）。
- 单元测试（`acp-http/*.test.ts`）+ 驱动真实 daemon 的黑盒冒烟脚本。

**延后处理（已记录，当前不实现）：**

- WebSocket 升级路径（RFD 要求的客户端能力；SSE 足以本地验证）。
- HTTP/2 多路复用（我们运行 HTTP/1.1；POST 和长连接 GET 使用独立 socket，适用于 CLI/Node 客户端及 ≤6 连接的浏览器）。已记录差异。
- 完整的 `fs/*` + `terminal/*` agent→client 转发（权限路径已验证机制；其余为机械性后续工作）。
- SSE 续传能力与环形缓冲的对等强化（RFD Phase 4）。

---

## 8. 本地验证方案

1. `npm run build`（或对 `cli` + `acp-bridge` 的工作区构建）。
2. 启动 daemon：`qwen serve --listen 127.0.0.1:0 --token <t>`（或使用环境变量 token）。
3. 运行 `node scripts/acp-http-smoke.mjs`：
   - `POST /acp {initialize}` → 断言返回 `200` + `Acp-Connection-Id`。
   - 打开连接级 SSE；`POST {session/new}` → 断言流上出现响应。
   - 打开 session 级 SSE；`POST {session/prompt:"say hi"}` → 断言至少 1 条 `session/update`，
     然后出现最终 `{result:{stopReason}}`。
   - 触发需要权限的工具 → 断言收到 `session/request_permission` 请求，
     POST 授权响应 → 断言 prompt 完成。
   - `POST {_qwen/session/set_model}` → 断言模型切换 + `session/update`。
4. Vitest：`acp-http/*.test.ts` 全部绿灯。

---

## 9. 风险

| 风险                                 | 缓解措施                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------- |
| RFD 在批准前发生变更                 | 通过能力标签 + `_qwen` 命名空间隔离；独立模块；易于修改。                  |
| HTTP/1.1 vs 要求的 HTTP/2            | localhost/CLI 客户端不受影响；已记录；h2 是后续的传输层替换。              |
| 同一 bridge 上两个传输层的竞争条件   | bridge 已支持多客户端；复用其锁机制。                                       |
| `fs/*` 转发 vs daemon 本地 FS        | 能力门控：客户端声明 `fs` 时转发，否则使用本地。                           |

---

## 10. 实现与验证日志（v1）

实现位于 `packages/cli/src/serve/acp-http/`（`json-rpc.ts`、`sse-stream.ts`、
`connection-registry.ts`、`dispatch.ts`、`index.ts`），通过 `server.ts` 中的
`mountAcpHttp(app, bridge, { boundWorkspace })` 挂载。

### 自动化测试（`packages/cli/src/serve/acp-http/*.test.ts`）

`transport.test.ts` 启动真实 Express 服务器 + 真实 `mountAcpHttp`，基于可控的 fake bridge，使用 `fetch` + 手动 SSE 解析驱动。
15 个测试全部通过，覆盖：`initialize` 200 + `Acp-Connection-Id`；未知连接 400；`session/new` 在连接流上的回复；prompt → `session/update` 流 + 最终结果关联；`session/request_permission` agent→client→agent 往返；`_qwen/session/set_model`；方法未找到；`DELETE` 清理。

### 实时 daemon（真实模型）

启动 `qwen serve --port 8767 --token … --workspace …`（bundle 入口，spawn 的 `qwen --acp` 子进程自包含），运行 `scripts/acp-http-smoke.mjs`：

```
✓ initialize: connectionId=… protocolVersion=1
✓ session/new: sessionId=…
→ prompt: "Reply with the single word: pong"
pong
✓ prompt complete: 10 session/update frames, stopReason=end_turn
✓ DELETE /acp — connection closed
ALL CHECKS PASSED ✅
```

错误路径也已在实际环境中确认：子进程启动失败时，bridge 超时以 JSON-RPC 错误帧的形式传递给客户端（连接流上的 `{"id":2,"error":{"code":-32603,…}}`），证明了 id 关联 + 失败场景下的 202/SSE 拆分。

### 审查合并——bridge 分配的 clientId（实时验证中发现）

第一次实时运行时 `session/prompt` 报错：_"client id … is not registered for session"_。根本原因：`spawnOrAttach`/`loadSession` **忽略**调用方提供的 bridge 未曾分配的 clientId，并生成新的（在 `BridgeSession.clientId` 中返回）；dispatcher 在 `sendPrompt` 时回显了连接自身的（未注册）id。修复：在 `SessionBinding` 上持久化 bridge 分配的 id，并在每次 per-session 调用时回显（`sessionCtx`）。已重新验证通过（见上方结果）。

---

## 11. 第 2 轮审查——合并修复

两次独立审查（正确性/并发 + 协议一致性/安全性）加上自读。
所有修复已通过扩展后的 vitest 套件（**18 个测试**）+ 新鲜实时冒烟运行（21 条 `session/update` → `stopReason=end_turn`）验证。

| #   | 严重度   | 问题                                                                                                                                                                                                                                              | 修复                                                                                                                                                                                    |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **P0**   | Session 流**重连永久失效**：`SessionBinding.abort` 创建一次后被复用；流关闭后永久中止，导致重连的 `subscribeEvents(signal)` 拿到已中止的 signal，收不到任何事件。 | `attachSessionStream` 现在每个流创建**新的** `AbortController`（并关闭任何已有流）；`index.ts` 在新 signal 上进行 pump。                                                               |
| R2  | **P0**   | `await dispatcher.handle()` 在 `res.end(202)` 之后运行；bridge 调用抛出异常（尤其是未被 try/catch 的 `isResponse` 路径）会导致 unhandled rejection → 可能使 daemon 崩溃。                                                                        | 对 `isResponse` 路径包裹 try/catch；对 awaited `handle(...)` 和 `pumpSessionEvents(...)` 加 `.catch()`。                                                                               |
| R3  | **P1**   | **无连接→session 所有权控制**：任何已鉴权的连接都可以打开工作区内任意 sessionId 的 session SSE 或发送 prompt（读取窃听；prompt 仅因未注册 clientId 错误而偶然受阻）。                                                                            | `AcpConnection.ownedSessions` 在 `session/new`/`load`/`resume` 时填充；未拥有的 id 在 session 流返回 `403`、per-session POST 返回 `INVALID_PARAMS`（`requireOwned`）。                |
| R4  | **P1**   | `mountAcpHttp` 句柄被丢弃 → TTL 清扫定时器 + 实时 SSE 流在关闭时泄漏。                                                                                                                                                                          | 句柄存入 `app.locals`；`runQwenServe` 关闭钩子在 `bridge.shutdown()` 之前调用 `dispose()`（与 device-flow registry 模式一致）。                                                       |
| R5  | **P1**   | **待处理权限泄漏**：session/连接关闭时有待处理权限，导致 bridge 阻塞等待投票。                                                                                                                                                                    | `closeSessionStream`/`destroy` 通过注入的 `onAbandonPending` → `cancelAbandonedPermission` 取消匹配的待处理请求。                                                                     |
| R6  | **P1**   | 预挂载帧缓冲（`connBuffer`/`binding.buffer`）无界。                                                                                                                                                                                               | 上限为 256 帧（丢弃最旧的），与 EventBus 的 `maxQueued` 一致。                                                                                                                         |
| R7  | **P2**   | `initialize` 忽略客户端请求的 `protocolVersion`。                                                                                                                                                                                                 | 协商 `min(requested, 1)`。                                                                                                                                                              |
| R8  | **P2**   | 无 `Acp-Session-Id` ↔ `params.sessionId` 交叉校验（RFD §2.3）。                                                                                                                                                                                  | POST 断言两者一致；不匹配 → `INVALID_PARAMS`。                                                                                                                                          |
| R9  | **P2**   | `session/cancel` 请求形式（带 id）未响应；顶层 `_meta.qwen` 重复。                                                                                                                                                                               | 有 id 时回复；单一 `agentCapabilities._meta.qwen`。                                                                                                                                    |

### 已接受/已记录（v1 中不修复）

- **Prompt 结果与尾部 `session/update` 的顺序**（P2）：`handlePrompt` await `sendPrompt` 后写入结果帧，而更新并发流式传输。实践中 bridge 在 `sendPrompt` resolve 之前将所有 `session/update` 发布到 bus，且两者共享同一有序 SSE 写入链，因此结果最后到达（已确认：21 条更新后出现结果）。如果客户端 reducer 对此敏感，可在后续进行严格屏障强化。
- **浏览器 `EventSource` 无法设置 `Authorization`** —— `/acp` GET 流需要 bearer header，因此浏览器需要延后实现的 WebSocket 路径（§7）；CLI/Node 客户端不受影响。
- daemon 真正的信任边界仍然是 **bearer token + 单工作区绑定**（与 REST 接口相同）；R3 的所有权检查是纵深防御 + 合约正确性，而非租户边界。

---

## 12. 第 3 轮审查——PR bot 合并修复（#4472）

两个自动化 PR 审查器加上汇总 bot。
所有修复已通过套件（现在 **22 个测试**）+ 新鲜实时运行（16 条 `session/update` → `end_turn`）验证。

| #   | 严重度   | 问题                                                                                                                                                                                                                                        | 修复                                                                                                                                                                         |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| B1  | **P0**   | `handlePrompt` 的 `AbortController` 从未被中止 —— 断开连接/取消的客户端导致 agent 持续运行（消耗模型配额，阻塞 session FIFO）。被两个 bot + 5 个子 agent 标记。                                                                              | `promptAbort` 存储在 `SessionBinding` 上；由 `session/cancel` 以及 session/连接清理（`closeSessionStream`/`destroy`）中止。                                                 |
| B2  | **P0**   | `sessionCtx` 缺少 `fromLoopback` → 所有 ACP 权限投票被视为远程；`local-only` 策略会拒绝 loopback 客户端。                                                                                                                                    | 在 `initialize` 时捕获 loopback（内核 `remoteAddress`，不可伪造的 header）→ `AcpConnection.fromLoopback` → 贯穿 `sessionCtx`。                                              |
| B3  | **P0**   | SSE 写入失败被静默吞噬 → 僵尸流（心跳触发，零事件传递，无日志）。                                                                                                                                                                            | 第一次写入失败时记录日志并关闭流。                                                                                                                                          |
| B4  | **P0**   | 空闲清扫无日志销毁连接 + 无连接数上限（initialize 洪泛）。                                                                                                                                                                                   | 清扫时记录每次回收；`pumpSessionEvents` 调用 `touch()`（长时间静默的 prompt 不被回收）；`maxConnections` 上限（64）→ `503`。                                                 |
| B5  | **P1**   | `sessionCtx` 在 binding 缺少 stamped clientId 时静默回退到连接的未注册 clientId（未经测试，在 `FakeBridge` 中始终触发）。                                                                                                                     | 缺少 stamped clientId 时抛出异常（不变量违反）；`FakeBridge` 现在会 stamp 一个。                                                                                            |
| B6  | **P1**   | `session/new                                                                                                                                                                                                                                | load                                                                                                                                                                        | resume` 接受未经验证的 `cwd`（REST 验证字符串/长度/绝对路径——可能导致放大 DoS）。              | 共享 `parseOptionalWorkspaceCwd`（字符串，≤4096，绝对路径）。 |
| B7  | **P1**   | `session/prompt` 向 bridge 转发未经验证的 `prompt`。                                                                                                                                                                                         | `validatePrompt`（非空对象数组），与 REST 保持一致。                                                                                                                         |
| B8  | **P1**   | 原始 bridge 错误消息回显给客户端。                                                                                                                                                                                                            | `toRpcError` 将已知 bridge 错误映射为有编码、客户端安全的形状；未知错误 → 通用 `Internal error`（完整详情仍输出到 stderr）。                                                |
| B9  | **P1**   | `nextId` 使用顺序负数 —— 客户端合法使用负数 id 可能与 `pending` 发生碰撞。                                                                                                                                                                    | daemon 产生的 id 现在为字符串（`_qwen_perm_N`），与任何客户端 id 不相交。                                                                                                   |
| B10 | **P2**   | `resolveClientResponse` 参数类型排除了 `JsonRpcError`；连接级 SSE 流无 `onClose`；`DELETE` 缺少 header 时静默返回 202；`SseStream.close` 在 try/catch 外运行 `onClose`；`session/load`、`resume`、`close` 未测试。 | 参数类型扩展为 `JsonRpcResponse`；连接流关闭时记录日志；`DELETE` 缺少 header → `400`；`onClose` 包裹在 try/catch 中；添加 load/resume/close + DELETE-400 测试。             |

**超出范围（基础分支 `daemon_mode_b_main`，不属于本 diff）** —— 第二位审查者标记了 `acpAgent.ts` 中的 typecheck 错误（`entryCount`/`entrySummary`/`sessionClose`）以及其他明确归属于基础分支（由 #4353 引入）的已有问题。另行跟踪，此处不修改。

**仍然延后处理**（已记录）：`DELETE`/连接所有权的 per-connection secret（token 仍为边界）；WebSocket + HTTP/2（§7）；严格的 prompt 结果与尾部更新顺序屏障（§11）。

---

## 13. 第 4 轮审查——PR 合并修复（rebase 到 #4469）

分支 rebase 到 `daemon_mode_b_main`（#4353 + #4469）—— **干净，无冲突**。两位 PR 审查者（GPT-5 + qwen3.7-max）。套件现在 **25 个测试**；实时重新验证（125 条 `session/update` → `end_turn`）。

| #   | 严重度   | 问题                                                                                                                                                                                                    | 修复                                                                                                                                                                                                           |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **P0**   | 第 3 轮"SSE 写入失败处理"已记录但**未实现** —— `SseStream` 仍将其留给调用方丢弃（僵尸流）。                                                                                                          | `writeRaw` 现在自行处理：第一次写入拒绝时记录一次并 `close()`；`doWrite` 也监听 `'error'`（立即拒绝而不是挂起到 `'close'`）；`onClose` 包裹在 try/catch 中。                                    |
| C2  | **P1**   | `fromLoopback` 仅在 `initialize` 时捕获 + 辅助函数比 REST 更窄 → 后续 POST 的 `local-only` 投票判断错误。                                                                                           | Per-request loopback 贯穿 `handle`→`sessionCtx`/`resolveClientResponse`；`isLoopbackReq` 扩展至 `127.0.0.0/8` + `::ffff:127.*` + `::1`（与 REST 一致）。                                        |
| C3  | **P1**   | 错误路由从 `params.sessionId` 推断流 → 连接级方法失败（`session/load`/`resume`/`close`/`heartbeat`）被误路由到不存在的 session 流（静默丢失）。                                                       | `CONN_ROUTED_METHODS` 集合；错误路由方式与成功路径相同。                                                                                                                                        |
| C4  | **P1**   | `bridge.detachClient` 在清理时从未调用 → 过时的 bridge-stamped 客户端 id 残留在 `knownClientIds()`/投票集中。                                                                                        | registry 接受 `DetachSessionFn`；`closeSessionStream`/`destroy` 对每个拥有的 session 进行 detach（尽力而为）。                                                                                  |
| C5  | **P1**   | `session/close` 在 `bridge.closeSession` 抛出时跳过本地清理。                                                                                                                                        | `closeSessionStream` 移入 `finally` 块。                                                                                                                                                        |
| C6  | **P2**   | Windows `cwd`（`C:\…`）被 `startsWith('/')` 拒绝。                                                                                                                                                   | `path.isAbsolute`（平台感知），与 REST 一致。                                                                                                                                                   |
| C7  | **P2**   | `protocolVersion` 可能协商出 `0`/负数。                                                                                                                                                               | 钳制为 `Math.max(1, Math.min(requested, 1))`；针对 0/负数/超大/无效值添加测试。                                                                                                                |
| C8  | **P2**   | `session/load`/`resume` 接受空 `sessionId`。                                                                                                                                                          | 空值拒绝，返回 `INVALID_PARAMS`。                                                                                                                                                               |
| C9  | **P2**   | 通知形式的 `session/prompt` 错误静默消失。                                                                                                                                                            | 在无 id 路径上记录日志。                                                                                                                                                                        |
| C10 | **P2**   | Session SSE 在 headers/`retry:` 之前刷新了缓冲帧。                                                                                                                                                   | `attachSessionStream` 之前先调用 `open()`。                                                                                                                                                     |
| C11 | **P2**   | 本地 `logStderr` 重复。                                                                                                                                                                               | 从 `utils/stdioHelpers` 共享 `writeStderrLine`。                                                                                                                                               |
| C12 | **P2**   | 文档宣传了 v1 中不存在的 `--no-acp-http` flag、`acp_http` 能力标签和 `fs/*` 转发。                                                                                                                   | 文档对齐已发布接口（仅环境变量开关；`fs/*`+`terminal/*` + flag + tag 标记为延后处理）。                                                                                                        |

仍然延后处理（不变）：WebSocket + HTTP/2；`DELETE`/所有权的 per-connection secret（token + 单工作区仍为边界）；严格的 prompt 结果顺序屏障；`as never` bridge 边界类型转换（有针对性，已在适配器类型后续工作中记录）。

---

## 14. 第 5 轮审查——PR 合并修复

再一轮审查（qwen3.7-max）。套件 **26 个测试**，实时重新验证。

| #   | 严重度   | 问题                                                                                                                                                                                                                                                                                                                                                                                    | 修复                                                                                                              |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **P0**   | `resolveClientResponse` 在调用 `respondToSessionPermission` **之前**删除了 pending 条目。格式错误的投票（`result: {}`）使 bridge 中介器抛出异常 —— 由于 pending 条目已删除，清理时的 `abandonPendingForSession` 无法取消它，导致 agent 的 prompt 挂起在一个永远不会 resolve 的投票上（持有 token 的用户可用一次错误 POST 来 stall session）。 | 将投票包裹在 try/catch 中；任何失败都回退到 `cancelAbandonedPermission`，以确保中介器始终被释放。新增测试覆盖格式错误投票路径。 |
| D2  | **P1**   | Session 流的 `onClose` 只中止了事件 pump，未中止 `binding.promptAbort` —— 客户端断开连接（关闭标签页/网络断开）后，正在进行的 prompt 继续运行（消耗配额 + FIFO），直到空闲 TTL。                                                                                                                                                                                                        | `onClose` 现在同时中止 session 的 `promptAbort`。                                                                |
| D3  | **P1**   | `pumpSessionEvents` reject 时 `.catch` 仅记录日志 —— SSE 流保持打开状态、持续发送心跳但不传递任何事件（僵尸流，无重连信号）。                                                                                                                                                                                                                                                           | `.catch` 现在同时调用 `closeSessionStream(sessionId)`。                                                          |

---

## 15. 第 6 轮审查——PR 合并修复

再一轮审查（qwen3.7-max）。套件 **28 个测试**，实时重新验证。

| #   | 严重度   | 问题                                                                                                                                                                                              | 修复                                                                                                                                                                                                                                                                                                                                       |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | **P0**   | `handlePrompt` 覆写 `binding.promptAbort` 时未中止先前的 controller —— 同一 session 的两个并发 `session/prompt` 使第一个成为孤儿（在 bridge FIFO 中运行至完成，无法被 `session/cancel` 中止）。 | 在安装新的 `promptAbort` 之前中止旧的。新增测试。                                                                                                                                                                                                                                                                                          |
| E2  | **P0**   | `subscribeEvents` 抛出时发送 `stream_error` 通知后 `return`（resolved）—— 调用方的 `.catch` 从未触发，留下僵尸 SSE 流（心跳、无事件、无重连信号）。                                             | 通知后重新抛出，以便调用方的 `.catch` 关闭流。测试断言 prompt 关闭。                                                                                                                                                                                                                                                                       |
| E3  | **P1**   | SSE 心跳未将连接标记为活跃 —— 超过 30 分钟无中间事件的长 prompt 被空闲回收（流 + prompt 被终止）。                                                                                               | `SseStream` 接受 `onHeartbeat` 钩子；两个 GET 处理器都传入 `() => conn.touch()`。                                                                                                                                                                                                                                                          |
| E4  | **P2**   | `pumpSessionEvents` 的 `.catch` 按 sessionId 关闭 —— 抛出与微任务之间的重连可能杀死新流。                                                                                                        | 身份守卫：仅在 `binding.stream` 仍然是当前流时关闭。                                                                                                                                                                                                                                                                                       |
| E6  | **P2**   | `sendSession` 自动创建 binding —— `closeSessionStream` 后的延迟 pump/回复帧复活了一个 ghost binding，永久缓冲最多 256 帧。                                                                        | `sendSession` 现在仅查找：session 无活跃 binding 时丢弃帧。                                                                                                                                                                                                                                                                                |
| E5  | 已接受   | `session/load`/`resume` 在另一活跃连接拥有该 session 时不拒绝（"劫持"）。                                                                                                                        | **已接受，不修改：** daemon 的信任边界是 bearer token + 单工作区绑定，多客户端附加是故意设计的（bridge 天然支持多客户端；REST 具有相同属性）。持有 token 的用户通过 REST 不具备任何额外能力。与其他 token 边界项（DELETE 所有权，§13）一并跟踪。 |

---

## 16. 第 7 轮审查——PR 合并修复

再一轮审查（qwen3.7-max）。套件 **30 个测试**，实时重新验证。

| #   | 严重度   | 问题                                                                                                                                                                                                          | 修复                                                                                                                                                                                                        |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **P0**   | `session/close` 并发 TOCTOU：`ownedSessions.delete` 仅在 `finally` 中运行（await 之后），两个并发 close 都通过了 `requireOwned` → 第 2 个收到误导性错误 + 冗余 bridge close。                                  | 在 await 之前**同步**删除所有权门控；bridge close 只执行一次。新增测试。                                                                                                                                    |
| F2  | **P1**   | Pump 生命周期：干净的迭代器结束（子进程结束，`done`）resolved → `.catch` 从未触发 → 僵尸流；中途迭代器错误未发送 `stream_error`。                                                                              | `pumpSessionEvents` 将整个循环包裹（同步 + 中途错误发送 `stream_error` 后重新抛出）；消费者 `.then(onDone, onErr)` 在两条路径上都关闭流（带身份守卫）。新增测试。                                          |
| F3  | **P2**   | 503 连接数上限拒绝无 stderr 日志。                                                                                                                                                                             | 使用 `writeStderrLine` 记录上限值。                                                                                                                                                                         |
| F4  | **P2**   | `_qwen/notify stream_error` spread 导致 `event.data.kind` 遮蔽鉴别符。                                                                                                                                        | 先 spread，再设置 `kind: 'stream_error'`。                                                                                                                                                                  |
| F5  | **P2**   | `MAX_WORKSPACE_PATH_LENGTH` 重复声明（`= 4096`）与 `fs/paths.js` 中的规范值不一致。                                                                                                                           | 从 `../fs/paths.js` 导入（消除差异）。                                                                                                                                                                      |
| F6  | **P2**   | `isObjectParams` 复制了 `json-rpc.isObject`。                                                                                                                                                                  | 导入 `isObject`。                                                                                                                                                                                           |
| F7  | **P2**   | `index.ts`/`sse-stream.ts` 中使用原始 `process.stderr.write`，与其他地方的 `writeStderrLine` 不一致。                                                                                                         | 整个模块统一使用 `writeStderrLine`。                                                                                                                                                                        |

---

## 17. REST 等价对齐 + 扩展方案审计落地（round 8）

目标：让 `/acp` 成为 REST+SSE 的**等价替代**。本批基于审计结论重构扩展方案，并补齐**所有 bridge 已暴露**的能力；bridge 尚未拥有的能力（文件 I/O、设备流、agents/memory CRUD）按架构正确性要求**先由 acp-bridge 补齐**（见 §17.3）。

### 17.1 扩展方案审计 → 落地（替换 §5 的旧方案）

依据**仓库实装 SDK `@agentclientprotocol/sdk@0.14.1`**（非仅官网）核对：

- `session/set_config_option` 是**一等（非 `unstable_`）方法**，请求 `{sessionId, configId, value}`，`category` 含 `model`/`mode`/`thought_level`；而 `set_model` 仍走 `unstable_setSessionModel`。
- 规范保留 `_` 前缀给扩展，示例为域风格 `_zed.dev/…`；厂商数据放 `_meta` 按域名分键。

落地：

- **命名空间 `_qwen/` → 反向域名 `_qwen/`**；`_meta` 统一 `_meta:{ "qwen": … }`（含 `initialize` 能力广告与 `session/request_permission` 的 requestId）。
- **模型 + 审批模式 → 标准 `session/set_config_option`**（`configId:"model"|"mode"`），路由到现有 `bridge.setSessionModel`/`setSessionApprovalMode`；`session/new` 结果**广告 `configOptions`**（取自子进程会话状态 `getSessionContextStatus().state.configOptions`，已是 ACP 形状）。**删除**厂商 `_qwen/session/set_model`。
- REST(http+sse) **无需同步修改**：两 transport 共用同一 bridge，状态天然一致。

### 17.2 本批新增的 `/acp` 方法（bridge 已支持，1:1 对齐 REST）

| REST                                                  | `/acp`                                             | bridge                                   |
| ----------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `POST /session/:id/model` / `approval-mode`           | **标准** `session/set_config_option`（model/mode） | setSessionModel / setSessionApprovalMode |
| `GET /session/:id/context`                            | `_qwen/session/context`                            | getSessionContextStatus                  |
| `GET /session/:id/supported-commands`                 | `_qwen/session/supported_commands`                 | getSessionSupportedCommandsStatus        |
| `PATCH /session/:id/metadata`                         | `_qwen/session/update_metadata`                    | updateSessionMetadata                    |
| `GET /workspace/{mcp,skills,providers,env,preflight}` | `_qwen/workspace/{…}`                              | getWorkspace\*Status                     |
| `POST /workspace/init`                                | `_qwen/workspace/init`                             | initWorkspace                            |
| `POST /workspace/tools/:name/enable`                  | `_qwen/workspace/set_tool_enabled`                 | setWorkspaceToolEnabled                  |
| `POST /workspace/mcp/:server/restart`                 | `_qwen/workspace/restart_mcp_server`               | restartMcpServer                         |

（既有：session/new·load·resume·close·list·prompt·cancel、heartbeat、permission、events 已对齐。）

### 17.3 仍缺口 → 要求 acp-bridge 先补齐（架构正确性）

REST 的 **文件 I/O**（`/file /glob /list /stat /file/write /file/edit`）、**设备流登录**（`/workspace/auth/*`）、**agents CRUD**（`/workspace/agents`）、**memory CRUD**（`/workspace/memory`）目前**不在 `HttpAcpBridge` 上**——REST 路由直接调 route 级服务（`WorkspaceFileSystemFactory`、`DeviceFlowRegistry`、`SubagentManager`、`writeWorkspaceContextFile`），绕过了 bridge。

**决策（采纳评审/owner 意见）**：不让 `/acp` transport 再去直连这些 route 级服务（那会复制 REST 的架构漂移、并使 transport 耦合翻倍）。**正确做法是先在 `@qwen-code/acp-bridge` 的 `HttpAcpBridge` 上补齐这些能力**（如 `readWorkspaceFile`/`writeWorkspaceFile`/`globWorkspace`、`startDeviceFlow`/`pollDeviceFlow`、`listAgents`/`upsertAgent`/`deleteAgent`、`readMemory`/`writeMemory`），让 REST 与 `/acp` 都经由 bridge。届时 `/acp` 再加 `_qwen/fs/*`、`_qwen/auth/*`、`_qwen/workspace/agent*`、`_qwen/workspace/memory*`（文件读因无标准 ACP client→agent 方法，属合法厂商扩展）。

**完整等价 = 本批（bridge 已有能力）+ acp-bridge 补齐缺口后的后续批**。

---

## 18. 第 9 轮审查——PR 合并修复

| #   | 严重度              | 问题                                                                                                                                                                                                                                                                             | 修复                                                                                                                                                                                    |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **P1（回归）**      | Session 流重连中止了正在进行的 prompt：`attachSessionStream` 在安装新流之前关闭了旧流，旧流的 `onClose` 无条件中止了 `promptAbort` —— 因此重连的客户端（网络抖动/漫游）丢失了正在运行的 prompt。 | 在关闭旧流之前先安装新流；身份守卫 `onClose` 的 prompt-abort（仅在当前流仍为 session 活跃流时中止）。新增测试（prompt 在重连后存活）。                                                 |
| G2  | **P2**              | `session/cancel` 将 `undefined` 作为 `CancelNotification` body 传入，丢弃了客户端提供的取消字段（reason/context），而 REST 会转发这些字段。                                                                                                                                       | 转发 `{ ...params, sessionId }`（与 REST 一致）。                                                                                                                                       |

Rebase 到最新的 `daemon_mode_b_main`（#4473/#4483/#4484/#4500），无冲突。套件 **33 个测试**，实时重新验证。

---

## 19. 路线图 / 后续 PR（防遗忘）

本 PR（#4472）= ACP Streamable HTTP transport + **全部 bridge-backed 能力对齐** + 官方扩展方案。已转 **ready**。达到「`/acp` 完全等价 REST+SSE」尚需：

1. **Follow-up PR 1 — acp-bridge 能力补齐（前置 / bridge-first）**：`HttpAcpBridge` 新增 文件 I/O、设备流、agents CRUD、memory CRUD 方法；REST 路由改走 bridge（消除直连 route 级服务的漂移）。
2. **Follow-up PR 2 — `/acp` 剩余对齐（依赖 PR 1）**：`_qwen/fs/*`、`_qwen/auth/*`、`_qwen/workspace/agent*`、`_qwen/workspace/memory*` → 完全等价 REST。

跟踪：#3803（open decisions）、#4175（Mode B roadmap）均已 comment。
Deferred 硬化项见 PR 描述「已知 deferred」。

---

## 20. 扩展命名空间重命名 + SDK 传输层分析（round 11）

- **命名空间 `_qwen.ai/` → `_qwen/`**：ACP 唯一的硬性规则是开头的 `_`；`_zed.dev/` 域名段只是约定示例，并非 MUST。由于 `qwen` 足够独特，使用更短的简洁形式。`_meta` key 同样使用 `"qwen"`。（真实 agent 调查：Zed/gemini-cli 大多使用标准方法上的 `_meta` + ACP 自身的 `unstable_*`；纯自定义 `_` 方法罕见 —— 我们的 `_qwen/*` 是真正新增的工作区/session 操作，无对应标准方法，因此 `_` 方法是正确工具。）
- **为何使用手写传输层（而非基于 SDK）**：TS SDK 仅附带 `ndJsonStream`（stdio）；RFD #721 HTTP 是 SDK Phase-3（未实现）。SDK `Connection` 是单双工流；我们的传输层是多流（POST + 连接级 SSE + per-session SSE）并需要按 sessionId 进行出站解复用 —— 而 dispatcher 在路由时就已知道 sessionId。完整 SDK 重写会与该模型产生冲突，也不会减少主要工作量（bridge 翻译、SSE 生命周期、所有权、EventBus→JSON-RPC）。**务实改进（候选后续工作）：采用 SDK 的 Zod schema 校验器 + 类型用于参数验证，同时保留手写传输层。** 使用 `extMethod('_qwen/…')` 的 SDK 客户端可与我们的处理器互操作（相同的 wire 形状）。
