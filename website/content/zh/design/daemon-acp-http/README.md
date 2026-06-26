# Daemon ACP-over-HTTP → 官方 ACP Streamable HTTP 传输协议

> 目标分支：`daemon_mode_b_main`。分支名称：`feat/daemon-acp-http-streamable`。
> 作者：arnoo.gao。日期：2026-05-24。状态：**设计 v1 → 实现中**。
> 遵循仓库优先设计的工作流：本文档在实现 PR 之前（或与之同时）落地，以便 wire contract 可审查。

---

## 0. 摘要

守护进程（`qwen serve`）目前通过一套**定制化 REST + SSE** 协议与 Web/SDK 客户端通信，同时通过 **实时 ACP JSON-RPC over stdio** 与衍生的 `qwen --acp` 子进程通信。本提案增加了一个**第二个北向传输层**，在单个 `/acp` 端点上实现 **官方 ACP Streamable HTTP 传输协议**（RFD #721），使得任何 ACP 原生客户端（Zed、Goose、未来的 SDK）可以通过标准协议直接驱动守护进程——无需了解 qwen 特有的 REST 知识。

**决策：双传输，增量添加。** 新的 `/acp` 端点挂载在现有 REST 表面旁边，复用底层的同一个 `HttpAcpBridge` + `EventBus`。**不移除** REST API。理由见 §6。

**决策：扩展命名空间 = `_qwen/…`**（单下划线前缀，这是 ACP 规范为自定义方法保留的形式），用于那些没有标准 ACP 方法的守护进程特性（模型切换、工作空间内省、心跳、多客户端权限策略、SSE 背压调优）。理由见 §5。

一个完整的、可在本地运行的参考实现在此 PR 中提供（`packages/cli/src/serve/acp-http/`），以及一个验证脚本（`scripts/acp-http-smoke.mjs`）。

---

## 1. 背景——当前“ACP over HTTP”的含义

三个层级（在提交 `0c0430939` 验证）：

```
┌──────────────┐  定制 REST + SSE (HTTP/1.1)  ┌────────────┐  ACP JSON-RPC   ┌──────────────┐
│ Web / SDK    │ ────────────────────────────► │  qwen      │  (stdio NDJSON) │ qwen --acp   │
│ 客户端       │ ◄─── GET /session/:id/events ── │  serve     │ ◄─────────────► │ 子进程 (Agent)│
│ (ACP 客户端) │       (text/event-stream)        │  (守护进程)│  ndJsonStream   │              │
└──────────────┘                                  └────────────┘                 └──────────────┘
        北向：不是 ACP 线缆                      桥接             南向：真正的 ACP
```

### 1.1 北向（客户端 ↔ 守护进程）——当前是定制协议

- Express 5 应用，位于 `packages/cli/src/serve/server.ts`（约 30 个路由）。
- 离散的 REST 动词，**不是** JSON-RPC：
  - `POST /session`（创建）、`POST /session/:id/prompt`、`POST /session/:id/cancel`、
    `POST /session/:id/load|resume`、`POST /session/:id/model`、
    `POST /session/:id/permission/:requestId`、`POST /session/:id/heartbeat`、
    `DELETE /session/:id`，以及 `/workspace/*`、`/capabilities`、`/health`。
- 服务端→客户端流：`GET /session/:id/events` → `text/event-stream`。
  - 帧格式：`id: <n>\nevent: <type>\ndata: <json>\n\n`（`server.ts:formatSseFrame`，约 2626 行）。
  - 每个会话的**单调递增 `id`** + 基于环形缓冲区的 `EventBus` 支持的 `Last-Event-ID` 恢复（`acp-bridge/src/eventBus.ts`）。
  - 事件 `type`：`session_update`、`client_evicted`、`slow_client_warning`、
    `state_resync_required`、`stream_error`……
- 认证：`Authorization: Bearer <token>`（`serve/auth.ts`），CORS 拒绝 + 主机允许列表。
- 背压：每个连接序列化写入链 + 15 秒心跳注释。

### 1.2 南向（守护进程 ↔ 子进程）——已经是 ACP

- `acp-bridge/src/spawnChannel.ts` 生成 `qwen --acp`，使用来自 `@agentclientprotocol/sdk`（`^0.14.1`）的 `ndJsonStream` 包装 stdin/stdout。
- `acp-bridge/src/bridge.ts:729` `new ClientSideConnection(() => client, channel.stream)` ——守护进程是 ACP **客户端**，子进程是 ACP **agent**。
- 此腿上已在使用的扩展方法：`unstable_setSessionModel`、`unstable_resumeSession`、`unstable_listSessions`（`acp-integration/acpAgent.ts`）。

### 1.3 为什么要迁移北向

- 每个客户端（webui、TS SDK、Java SDK、Python SDK、VSCode 扩展）都重新实现了定制 REST 映射。ACP 标准端点允许 ACP 原生编辑器无需任何 qwen 特定胶水代码即可连接。
- 使守护进程的远程表面与其内部已经使用的协议对齐。

---

## 2. 目标：ACP Streamable HTTP（RFD #721）

已合并的**草案** RFD（`agentclientprotocol/agent-client-protocol#721`，2026-04-22 合并）。尚未成为规范；尚未在任何 SDK 中。我们根据 RFD wire 设计实现。

### 2.1 端点和动词（单个 `/acp`）

| 动词           | 行为                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /acp`    | 发送 JSON-RPC。`initialize` → **`200`** + JSON 主体（能力集），并设置 `Acp-Connection-Id`。所有其他请求/通知 → **`202 Accepted`**，空主体；_响应_（如果有）将在匹配的长寿命 SSE 流上传递。                                    |
| `GET /acp`     | 打开一个长寿命 **SSE** 流。（`Upgrade: websocket` → WebSocket；**推迟**，见 §7。）                                                                                                                                                  |
| `DELETE /acp`  | 终止连接 → `202`。                                                                                                                                                                                                                  |

### 2.2 两层长寿命流

- **连接级流**：`GET /acp` 带 `Acp-Connection-Id` 头，无会话头。承载连接级响应（`session/new`、`session/load`、`authenticate`）和连接级通知。
- **会话级流**：`GET /acp` 带 `Acp-Connection-Id` **和** `Acp-Session-Id`。承载 `session/update` 通知、**agent→客户端请求**（`session/request_permission`、`fs/read_text_file`……），以及对会话 POST 的响应（`session/prompt`、`session/cancel`）。

### 2.3 身份（3 层）

- `Acp-Connection-Id`（HTTP 头）——传输绑定，在 `initialize` 时生成。
- `Acp-Session-Id`（HTTP 头）——在会话级 GET 和会话 POST 时需要。
- `sessionId`（JSON-RPC 参数）——在方法参数内（必须与头匹配）。

### 2.4 与 MCP StreamableHTTP 的差异

ACP 使用**长寿命**流（不是每次请求的 SSE）、**两个** ID 头（连接与会话）、`202` 用于非初始化请求、必须使用 HTTP/2、必须支持 WebSocket 客户端。我们借鉴了单一端点 + POST/GET-SSE + 会话头的骨架，但适应了长寿命双 ID 模型。我们**不**复用 `@modelcontextprotocol/sdk` 的 `StreamableHTTPServerTransport`（其每次请求流模型和单一的 `Mcp-Session-Id` 不适用）。

### 2.5 标准方法（从当前 schema 确认）

- 客户端→Agent 请求：`initialize`、`authenticate`、`session/new`、`session/load`、
  `session/prompt`、`session/resume`、`session/close`、`session/list`、
  `session/set_mode`、`session/set_config_option`、`logout`。
- 客户端→Agent 通知：`session/cancel`。
- Agent→客户端请求：`fs/read_text_file`、`fs/write_text_file`、
  `session/request_permission`、`terminal/create|output|wait_for_exit|kill|release`。
- Agent→客户端通知：`session/update`。

---

## 3. 新传输协议架构

守护进程必须在北向通过 HTTP 呈现一个 **ACP Agent 表面**，同时在南向保持对子进程的 ACP **客户端**角色。因此，`/acp` 层是一个**JSON-RPC 路由器**，它终止 HTTP 传输并桥接到现有的 `HttpAcpBridge`。

```
            POST /acp (JSON-RPC 请求/响应/通知)
客户端  ──────────────────────────────────────────────►  ┌───────────────────────────┐
(编辑器)                                                  │  AcpHttpTransport         │
        ◄── GET /acp  (连接级 SSE) ────────────────────  │  - 连接注册表             │
        ◄── GET /acp  (会话级 SSE) ────────────────────  │  - JSON-RPC id 关联      │
                                                          │  - 方法派发              │
                                                          └────────────┬──────────────┘
                                                                       │ 复用
                                                          ┌────────────▼──────────────┐
                                                          │  HttpAcpBridge + EventBus  │  (未改动)
                                                          └────────────┬──────────────┘
                                                                       │ ACP stdio (未改动)
                                                                 qwen --acp 子进程
```

### 3.1 新模块布局（`packages/cli/src/serve/acp-http/`）

| 文件                       | 职责                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`                 | `mountAcpHttp(app, bridge, opts)` — 在现有 Express 应用上注册 `/acp` 路由。                                                                                                                        |
| `connection-registry.ts`   | `Acp-Connection-Id` → `AcpConnection`（连接的 SSE 写入器、`Map<sessionId, SessionStream>`、按 JSON-RPC id 挂起的 agent→客户端请求、单调递增 id 分配器）。TTL + DELETE 清理。                     |
| `json-rpc.ts`              | JSON-RPC 2.0 解析/验证/序列化辅助函数；错误码（`-32600` 等）；`_qwen/` 命名空间守卫。                                                                                                             |
| `dispatch.ts`              | 将入站 JSON-RPC 方法映射到 `HttpAcpBridge` 调用。将 `BridgeEvent` 映射为出站 JSON-RPC 帧。翻译表（§4）。                                                                                         |
| `sse-stream.ts`            | 长寿命 SSE 写入器（复用 `server.ts` 中的背压/心跳模式）。与 REST `/events` 不同（不同的帧格式：完整的 JSON-RPC 对象，不是 qwen 事件信封）。                                                       |

不改动 `bridge.ts` / `eventBus.ts`（仅为增量消费者）。

### 3.2 连接和会话生命周期

1. `POST /acp {initialize}` → 生成 `connectionId`，创建 `AcpConnection`，回复 `200`，内容为 `{protocolVersion, agentCapabilities, _meta:{qwen:{…}}}` + `Acp-Connection-Id` 头。
2. 客户端打开 `GET /acp`（连接级），携带 `Acp-Connection-Id`。
3. `POST /acp {session/new}` → `202`；守护进程调用 `bridge.createSession(...)`；将 JSON-RPC 响应（包含 `sessionId`）推送到**连接**流。
4. 客户端打开 `GET /acp`（会话级），携带 `Acp-Connection-Id`+`Acp-Session-Id`；守护进程调用 `bridge.subscribeEvents(sessionId)` 并管道传输翻译后的帧。
5. `POST /acp {session/prompt}` → `202`；`bridge.sendPrompt(...)`；`session/update` 通知实时流在会话流上；当最终提示**响应**（`{id, result:{stopReason}}`）稳定后，将其推送到会话流。
6. Agent→客户端请求（例如 `session/request_permission`）以 JSON-RPC **请求**形式在会话流上发出，带有守护进程分配的 id；客户端通过 `POST /acp {id, result}` 应答；`dispatch` 通过桥的权限 API 解析它。
7. `DELETE /acp`（或连接流关闭 + TTL）拆除会话/订阅。

---

## 4. 翻译表（桥 ⇄ ACP/HTTP）

### 4.1 入站（客户端 POST → 桥）

| ACP 方法                                   | 桥调用                                                 | 响应路由到                  |
| ------------------------------------------ | ------------------------------------------------------ | --------------------------- | --------------------------- |
| `initialize`                               | （无；能力来自 `capabilities.ts`）                     | 内联 `200`                  |
| `authenticate`                             | 现有认证提供者（`serve/auth/*`）                       | 连接流                      |
| `session/new`                              | `bridge.createSession`                                 | 连接流                      |
| `session/load` / `session/resume`          | `bridge.restoreSession('load'                          | 'resume')`                  | 连接流                      |
| `session/prompt`                           | `bridge.sendPrompt`                                    | 会话流（延迟直到稳定）      |
| `session/cancel`（通知）                   | `bridge.cancel`                                        | —                           |
| `session/list`                             | `bridge.listSessions`（`unstable_listSessions`）       | 连接流                      |
| `session/set_mode`                         | 审批模式路由逻辑                                       | 会话流                      |
| JSON-RPC **响应**（对 agent→客户端请求的） | 解析挂起的（§4.3）                                     | —                           |
| `_qwen/session/set_model`                  | `bridge.setSessionModel`（`unstable_setSessionModel`） | 会话流                      |
| `_qwen/workspace/list` 等                  | 工作空间内省路由                                       | 连接流                      |
| `_qwen/session/heartbeat`                  | `bridge.heartbeat`                                     | 连接流                      |

### 4.2 出站（BridgeEvent → 会话流上的 JSON-RPC）

| BridgeEvent.type                                                       | 发出为                                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `session_update`                                                       | `{method:"session/update", params:<data>}` 通知                        |
| 权限请求                                                               | `{id:<n>, method:"session/request_permission", params}` 请求           |
| `client_evicted` / `slow_client_warning` / `state_resync_required`     | `{method:"_qwen/notify", params:{kind,…}}` 通知                        |
| `stream_error`                                                         | 在活动 prompt id 上的 JSON-RPC 错误响应（或 `_qwen/notify`）           |
| prompt 稳定                                                            | `{id:<promptId>, result:{stopReason}}`                                 |

### 4.3 挂起的 agent→客户端请求

`AcpConnection` 维护 `Map<jsonRpcId, {sessionId, kind, bridgeRequestId, resolve}>`。当客户端 POST 一个 JSON-RPC 响应对象时，`dispatch` 匹配 `id`，然后调用桥的解析路径（例如权限 `POST /session/:id/permission/:requestId` 的内部等价物）。

> **v1 状态：** 只实现了 `session/request_permission` agent→客户端往返。`fs/*` 和 `terminal/*` agent→客户端转发**推迟**（§7）——守护进程尚未在 `/acp` 上通告 `fs`/`terminal` 客户端能力协商，因此 ACP 客户端在 v1 中不应假定通过此传输协议具有文件系统/终端语义。预期的最终状态（将 `fs/*` 转发给客户端；当客户端缺少 `fs` 能力时回退到守护进程的工作空间 FS）是 §7 中描述的后续工作。

---

## 5. 扩展策略（需求 #2）

ACP 保留了所有以 `_` 开头的方法用于自定义扩展，并为每种类型提供了 `_meta`。代码库的南向腿已经使用了 `unstable_*` 方法名。

**北向选择：** 厂商命名空间的 **`_qwen/<area>/<verb>`** 方法名（符合规范的 `_` 前缀）。能力在 `initialize` 时通过 `agentCapabilities._meta.qwen` 通告，以便客户端在使用前进行特性检测。

| 需求                                                   | 没有标准 ACP 方法？ | 扩展                                                     |
| ------------------------------------------------------ | ------------------- | -------------------------------------------------------- |
| 模型切换                                               | 是                  | `_qwen/session/set_model`                                |
| 工作空间 MCP/技能/提供者/环境内省                      | 是                  | `_qwen/workspace/list`、`_qwen/workspace/<area>`         |
| 心跳/最后可见时间                                      | 是                  | `_qwen/session/heartbeat`                                |
| 多客户端权限策略（共识/指定）                          | 部分                | `session/request_permission` + `_meta.qwen.policy`       |
| SSE 背压调优（`maxQueued`）                            | 是                  | 会话 GET 上的 `Acp-Qwen-Max-Queued` 头                   |
| 恢复游标（环形 `Last-Event-ID`）                       | RFD 阶段 4          | `Last-Event-ID` 头 + 帧上的 `_meta.qwen.eventId`         |

标准方法**绝不**重命名；扩展严格是增量添加的，并且可以忽略。

---

## 6. 双传输 vs 替换（需求 #4）

**决策：双传输（增量添加）。**

- 官方传输协议是**草案** RFD，并非规范，且在所有 SDK 中都不存在——硬替换会使我们与未批准的设计耦合，并同时破坏 webui + 3 个 SDK + VSCode 扩展。
- REST 表面承载着尚无干净 ACP 映射的特性（工作空间内省、多客户端权限调解、环形缓冲区恢复、能力注册表）。这些在 `/acp` 上退化为 `_qwen/*` 扩展，但 REST 表面在 RFD 批准之前保持权威。
- 两个传输协议共享**一个** `HttpAcpBridge` + `EventBus` 实例，因此没有状态重复——`/acp` 和 `/session/*` 甚至可以同时驱动同一个实时会话（桥已经支持多客户端）。
- 开关（v1，随版本提供）：默认启用；**`QWEN_SERVE_ACP_HTTP=0`** 禁用挂载。一个 `--no-acp-http` CLI 标志和 `/capabilities` 中的 `acp_http` 标签用于客户端特性检测**推迟**到后续版本（不在 v1 中）——在此之前，客户端通过探测 `POST /acp {initialize}` 来检测传输协议。

迁移路径：一旦 RFD 批准且 SDK 发布，REST 路由可以重构为 `/acp` 之上的薄兼容层（单独的后续 PR）。

---

## 7. 实现 PR 的范围

**在范围内（可运行且本地验证）：**

- `POST /acp` 派发，支持 `initialize`、`session/new`、`session/prompt`、
  `session/cancel`、`session/load`、JSON-RPC 响应处理。
- 连接级和会话级 `GET /acp` SSE 流，使用 JSON-RPC 帧格式。
- `session/update` 流式传输 + 最终提示响应关联。
- `session/request_permission` agent→客户端往返。
- `_qwen/session/set_model` 扩展，作为需求 #2 的实例。
- 复用 Bearer 认证 + 主机允许列表（与 REST 相同的中间件）。
- 单元测试（`acp-http/*.test.ts`）+ 一个黑盒 smoke 脚本，驱动真实的守护进程。

**推迟（已记录，现在不构建）：**

- WebSocket 升级路径（RFD 要求的客户端能力；SSE 足以本地验证）。
- HTTP/2 多路复用（我们运行 HTTP/1.1；POST 和长寿命 GET 使用单独的套接字，这对于 CLI/Node 客户端和 ≤6 连接的浏览器有效）。已记录差异。
- 完整的 `fs/*` + `terminal/*` agent→客户端转发（权限路径证明了机制；其余是机械性的后续工作）。
- 与环形缓冲区（RFD 阶段 4）相当的 SSE 可恢复性强化。
---

## 8. 本地验证计划

1. `npm run build`（或对 `cli` + `acp-bridge` 进行工作区构建）。
2. 启动守护进程：`qwen serve --listen 127.0.0.1:0 --token <t>`（或使用环境变量中的 token）。
3. 运行 `node scripts/acp-http-smoke.mjs`：
   - `POST /acp {initialize}` → 断言 `200` + `Acp-Connection-Id`。
   - 打开连接的 SSE；`POST {session/new}` → 断言在流上得到响应。
   - 打开会话 SSE；`POST {session/prompt:"say hi"}` → 断言至少收到 1 个 `session/update`，
     然后以一个带有 `{result:{stopReason}}` 的最终帧结束。
   - 触发一个需要授权的工具 → 断言收到 `session/request_permission` 请求，
     再 POST 一个授权响应 → 断言 prompt 完成。
   - `POST {_qwen/session/set_model}` → 断言模型切换成功并收到 `session/update`。
4. Vitest 测试：`acp-http/*.test.ts` 全部通过。

---

## 9. 风险

| 风险                                       | 缓解措施                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| RFD 在正式定稿前可能变更                       | 位于能力标签之后 + `_qwen` 命名空间内；隔离模块；易于修订。                              |
| HTTP/1.1 与所需的 HTTP/2 不匹配                | 本地/CLI 客户端不受影响；已文档化；h2 可作为后续传输层替换。                            |
| 双传输通道在同一个桥接器上竞态                    | 桥接器已支持多客户端；复用其锁机制。                                              |
| `fs/*` 转发 vs 守护进程本地文件系统              | 由能力门控：当客户端声明 `fs` 能力时转发，否则使用本地能力。                          |

---

## 10. 实现与验证日志（v1）

在 `packages/cli/src/serve/acp-http/` 中实现（`json-rpc.ts`、`sse-stream.ts`、
`connection-registry.ts`、`dispatch.ts`、`index.ts`），从 `server.ts` 通过
`mountAcpHttp(app, bridge, { boundWorkspace })` 挂载。

### 自动化测试（`packages/cli/src/serve/acp-http/*.test.ts`）

`transport.test.ts` 启动一个真实的 Express 服务器 + 在可控的伪造桥接器上使用真实的 `mountAcpHttp`，
并通过 `fetch` 加手工 SSE 解析来驱动测试。共 15 项测试通过，覆盖：`initialize` 返回 200 + `Acp-Connection-Id`；
未知连接返回 400；`session/new` 在连接流上回复；prompt → 流式 `session/update` + 最终结果关联；
`session/request_permission` agent→client→agent 完整往返；`_qwen/session/set_model`；方法未找到；
`DELETE` 拆除。

### 现场守护进程（真实模型）

启动 `qwen serve --port 8767 --token … --workspace …`（使用 bundle 入口，因此生成的 `qwen --acp` 子进程是自包含的）
并运行 `scripts/acp-http-smoke.mjs`：

```
✓ initialize: connectionId=… protocolVersion=1
✓ session/new: sessionId=…
→ prompt: "Reply with the single word: pong"
pong
✓ prompt complete: 10 session/update 帧, stopReason=end_turn
✓ DELETE /acp — 连接已关闭
所有检查通过 ✅
```

还现场验证了错误路径：当子进程启动失败时，桥接器超时以 JSON-RPC 错误帧的形式在连接流上返回给客户端
（`{"id":2,"error":{"code":-32603,…}}`），证明了 id 关联以及失败情况下 202/SSE 分离机制。

### 审查合并——桥接器签发的 clientId（现场验证时发现）

首次现场运行时 `session/prompt` 失败，报错为 _"client id … is not registered for
session"_。根本原因：`spawnOrAttach`/`loadSession` **忽略**调用方提供的、桥接器从未签发过的 clientId，
并重新生成一个新的（通过 `BridgeSession.clientId` 返回）；分发器在 `sendPrompt` 中使用了连接自身的（未注册的）id。
修复方法：将桥接器签发的 id 持久化到 `SessionBinding` 中，并在每次按会话调用时（`sessionCtx`）使用该 id。
重新验证后上述测试通过。

---

## 11. 第二轮审查——合并修改

进行了两次独立审查（正确性/并发性 + 协议合规性/安全性）以及一次自读。
所有修复均通过扩展后的 vitest 测试套件（**18 项测试**）和新一轮现场冒烟测试（21 个 `session/update` 帧 → `stopReason=end_turn`）验证。

| #   | 严重级别 | 发现                                                                                                                                                                                                                                             | 修复                                                                                                                                                                                                   |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **P0**   | 会话流**重连永久失效**：`SessionBinding.abort` 只创建一次并被复用；流关闭后它被永远中断，因此重新连接的 `subscribeEvents(signal)` 立即得到一个已中断的信号，导致收到零事件。                                                                                       | `attachSessionStream` 现在为每个流安装一个**新的** `AbortController`（并关闭任何先前的流）；`index.ts` 基于该新信号进行泵送。                                                                                       |
| R2  | **P0**   | `await dispatcher.handle()` 在 `res.end(202)` **之后** 执行；一个会抛出异常的桥接调用（尤其是未使用 try/catch 包装的 `isResponse` 路径）会导致 Promise 被拒绝但未被处理，可能造成守护进程崩溃。                                                                      | 将 `isResponse` 路径包裹在 try/catch 中；对 `handle(...)` 及 `pumpSessionEvents(...)` 使用了 `.catch()`。                                                                                               |
| R3  | **P1**   | **没有连接→会话所有权检查**：任何已认证的连接都可以打开工作区中 _任意_ sessionId 的会话 SSE 或向其发送 prompt（可窃听读取；prompt 仅因未注册 clientId 的错误而偶然被阻止）。                                                                                  | `AcpConnection.ownedSessions` 由 `session/new`/`load`/`resume` 填充；会话流返回 `403`，按会话的 POST 对无所有权的 id 返回 `INVALID_PARAMS`（`requireOwned`）。                                          |
| R4  | **P1**   | `mountAcpHttp` 的 handle 被丢弃 → TTL 清理定时器 + 活跃的 SSE 流在关闭时泄漏。                                                                                                                                                                     | handle 保存在 `app.locals` 上；`runQwenServe` 的 close 钩子在 `bridge.shutdown()` 之前调用 `dispose()`（与设备流注册表一致）。                                                                              |
| R5  | **P1**   | **待处理权限泄漏**：关闭一个存在未决权限的会话/连接会使得桥接器一直阻塞等待投票。                                                                                                                                                                        | `closeSessionStream`/`destroy` 通过注入的 `onAbandonPending` 取消匹配的待处理请求 → `cancelAbandonedPermission`。                                                                                      |
| R6  | **P1**   | 预附加帧缓冲区（`connBuffer`/`binding.buffer`）无大小限制。                                                                                                                                                                                        | 限制为 256 帧（丢弃最旧的），与 EventBus 的 `maxQueued` 一致。                                                                                                                                         |
| R7  | **P2**   | `initialize` 忽略了客户端请求的 `protocolVersion`。                                                                                                                                                                                               | 协商为 `min(requested, 1)`。                                                                                                                                                                          |
| R8  | **P2**   | 未进行 `Acp-Session-Id` ↔ `params.sessionId` 交叉校验（RFD §2.3）。                                                                                                                                                                             | POST 时断言两者一致；不一致时返回 `INVALID_PARAMS`。                                                                                                                                                    |
| R9  | **P2**   | `session/cancel` 请求形式（带 id）从未被应答；顶层的 `_meta.qwen` 重复。                                                                                                                                                                           | 当 id 存在时回复；使用单个 `agentCapabilities._meta.qwen`。                                                                                                                                           |

### 已接受/已记录（v1 中未修复）

- **Prompt 结果与后续 `session/update` 的顺序**（P2）：`handlePrompt` 等待 `sendPrompt` 完成，
  然后写入结果帧，而更新流是并发发送的。实际中桥接器将所有 `session/update` 发布到总线后才 resolve `sendPrompt`，
  并且两者共享一个有序的 SSE 写入链，因此结果帧总是最后到达（已验证：21 个更新帧后跟结果帧）。
  如果将来有客户端 reducer 对顺序敏感，可以增加一个严格屏障。
- **浏览器 `EventSource` 无法设置 `Authorization`** — `/acp` GET 流需要 bearer 头，
  因此浏览器需要使用延期的 WebSocket 路径（§7）；CLI/Node 客户端不受影响。
- 守护进程的真实信任边界仍然是 **bearer token + 单工作区绑定**（与 REST 表面一致）；
  R3 的所有权检查是纵深防御 + 协议正确性，而非租户边界。

---

## 12. 第三轮审查——PR 机器人合并修改（#4472）

两位自动化 PR 审查者加上摘要机器人。
所有修复均通过测试套件（现为 **22 项测试**）+ 新的一次现场运行（16 个 `session/update` → `end_turn`）验证。

| #   | 严重级别 | 发现                                                                                                                                                                                                                                                                    | 修复                                                                                                                                                                                                                                          |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **P0**   | `handlePrompt` 的 `AbortController` 从未被中止——断开连接/取消的客户端仍会让 agent 继续运行（消耗模型配额，阻塞会话 FIFO）。被两个机器人及 5 个子 agent 共同标记。                                                                                                                           | `promptAbort` 保存在 `SessionBinding` 上；通过 `session/cancel` 以及会话/连接拆除（`closeSessionStream`/`destroy`）来中止。                                                                                                                  |
| B2  | **P0**   | `sessionCtx` 缺少 `fromLoopback` → 每个 ACP 权限投票都被视为远程；`local-only` 策略会拒绝回环客户端。                                                                                                                                                                          | 在 `initialize` 时捕获回环标志（内核 `remoteAddress`，不可伪造的头部）→ `AcpConnection.fromLoopback` → 通过 `sessionCtx` 传递。                                                                                                             |
| B3  | **P0**   | SSE 写入失败被静默吞掉 → 产生僵尸流（心跳继续触发，但零事件送达，无日志）。                                                                                                                                                                                                    | 首次写入失败即记录日志并关闭流。                                                                                                                                                                                                             |
| B4  | **P0**   | 空闲清理无日志且无连接上限（可被初始化洪水攻击）。                                                                                                                                                                                                                           | 清理时记录每个回收连接；`pumpSessionEvents` 调用 `touch()`（长时间静默的 prompt 不会被回收）；`maxConnections` 上限设为 64 → 返回 `503`。                                                                                                      |
| B5  | **P1**   | 当 `SessionBinding` 缺少已签发的 clientId 时，`sessionCtx` 静默回退到连接的未注册 clientId（在 `FakeBridge` 中从未触发，因为它总是附带该 id）。                                                                                                                               | 当缺少已签发的 clientId 时抛出异常（不可变违反）；`FakeBridge` 现在签发一个 id。                                                                                                                                                             |
| B6  | **P1**   | `session/new                                                                                                                                                                                                                                                            | load                                                                                                                                                                                                                                        | resume`中`accepted`cwd`未经验证（REST 验证了字符串/长度/绝对路径——放大了 DoS 攻击）。                                                                                                                            | 共享 `parseOptionalWorkspaceCwd`（字符串，≤4096，绝对路径）。                                                                                                                          |
| B7  | **P1**   | `session/prompt` 将未经验证的 `prompt` 转发给桥接器。                                                                                                                                                                                                                     | `validatePrompt`（非空对象数组），与 REST 一致。                                                                                                                                                                                            |
| B8  | **P1**   | 原始桥接器错误消息直接回显给客户端。                                                                                                                                                                                                                                     | `toRpcError` 将已知桥接器错误映射为带编码的客户端安全形状；未知错误映射为通用 `Internal error`（完整细节仍输出到 stderr）。                                                                                                                 |
| B9  | **P1**   | `nextId` 使用顺序负数——合法使用负 id 的客户端可能与 `pending` 中的 id 冲突。                                                                                                                                                                                             | 守护进程生成的 id 现在为字符串（`_qwen_perm_N`），与任何客户端 id 不相交。                                                                                                                                                                     |
| B10 | **P2**   | `resolveClientResponse` 参数类型排除了 `JsonRpcError`；连接级别的 SSE 流没有 `onClose`；无头部的 `DELETE` 静默返回 202；`SseStream.close` 在 try/catch 外调用 `onClose`；`session/load`·`resume`·`close` 未经测试。                                                           | 参数类型扩展为 `JsonRpcResponse`；连接流在关闭时记录日志；缺少头部的 `DELETE` 返回 `400`；`onClose` 包裹在 try/catch 中；添加了 load/resume/close 以及 DELETE-400 的测试。                                                                 |

**不在本次范围（基础分支 `daemon_mode_b_main`，非本 diff）**——第二位审查者标记了 `acpAgent.ts` 中的类型检查错误（`entryCount`/`entrySummary`/`sessionClose`）及其他已明确归因于基础分支的预存问题（由 #4353 引入）。已单独跟踪；此处未改动。

**仍推迟处理**（已记录）：每个连接用于 `DELETE`/连接所有权的密钥（token 仍是边界）；WebSocket + HTTP/2（§7）；严格的 prompt 结果与后续更新帧的顺序屏障（§11）。

---

## 13. 第四轮审查——PR 合并修改（基于 #4469 变基）

分支变基到 `daemon_mode_b_main`（#4353 + #4469）——**干净，无冲突**。两位 PR 审查者（GPT-5 + qwen3.7-max）。测试套件现为 **25 项测试**；现场重新验证（125 个 `session/update` → `end_turn`）。

| #   | 严重级别 | 发现                                                                                                                                                                                                                                             | 修复                                                                                                                                                                                                                                                           |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | **P0**   | 第三轮的"SSE 写入失败处理"已记录但**未实现**—`SseStream` 仍将问题留给忽略的调用者（僵尸流）。                                                                                                                                                          | `writeRaw` 现在自主处理：首次写入拒绝时记录一次日志 + `close()`；`doWrite` 也监听 `'error'` 事件（立即拒绝而非挂起等待 `'close'`）；`onClose` 包裹在 try/catch 中。                                                                                        |
| C2  | **P1**   | `fromLoopback` 仅在 `initialize` 时捕获 + 辅助函数范围比 REST 窄 → 后续 POST 中的 `local-only` 投票被误判。                                                                                                                                          | 每次请求的回环标志通过 `handle`→`sessionCtx`/`resolveClientResponse` 传递；`isLoopbackReq` 扩展为 `127.0.0.0/8` + `::ffff:127.*` + `::1`（与 REST 一致）。                                                                                                  |
| C3  | **P1**   | 错误路由根据 `params.sessionId` 推断流 → 连接范围的方法失败（如 `session/load`/`resume`/`close`/`heartbeat`）被错误地路由到不存在的会话流（静默丢失）。                                                                                                 | 定义 `CONN_ROUTED_METHODS` 集合；错误路径与成功路径采用相同的路由方式。                                                                                                                                                                                        |
| C4  | **P1**   | 拆除时从未调用 `bridge.detachClient` → 桥接器签发的 client id 残留在 `knownClientIds()`/投票者集合中。                                                                                                                                                 | 注册表接受 `DetachSessionFn`；`closeSessionStream`/`destroy` 拆除每个拥有的会话（尽力而为）。                                                                                                                                                                   |
| C5  | **P1**   | `session/close` 在 `bridge.closeSession` 抛出异常时跳过了本地清理。                                                                                                                                                                                 | 将 `closeSessionStream` 移入 `finally` 块。                                                                                                                                                                                                                    |
| C6  | **P2**   | Windows 下的 `cwd`（如 `C:\…`）被 `startsWith('/')` 拒绝。                                                                                                                                                                                         | 使用 `path.isAbsolute`（平台感知），与 REST 一致。                                                                                                                                                                                                             |
| C7  | **P2**   | `protocolVersion` 可能协商为 `0`/负数。                                                                                                                                                                                                         | 限制为 `Math.max(1, Math.min(requested, 1))`；添加了 0/负数/极大值/无效值的测试。                                                                                                                                                                           |
| C8  | **P2**   | `session/load`/`resume` 接受空的 `sessionId`。                                                                                                                                                                                                  | 拒绝空值，返回 `INVALID_PARAMS`。                                                                                                                                                                                                                             |
| C9  | **P2**   | 通知形式的 `session/prompt` 错误静默消失。                                                                                                                                                                                                       | 在无 id 路径上记录日志。                                                                                                                                                                                                                                     |
| C10 | **P2**   | 会话 SSE 在头部/`retry:` 之前发送了缓冲帧。                                                                                                                                                                                                       | 在 `attachSessionStream` 之前调用 `open()`。                                                                                                                                                                                                                  |
| C11 | **P2**   | 重复的本地 `logStderr`。                                                                                                                                                                                                                       | 使用来自 `utils/stdioHelpers` 的共享 `writeStderrLine`。                                                                                                                                                                                                       |
| C12 | **P2**   | 文档宣传了 `--no-acp-http` 标志、`acp_http` 能力标签以及 `fs/*` 转发，但这些在 v1 中并未实现。                                                                                                                                                      | 文档与实际发布的功能对齐（仅环境变量切换；`fs/*`+`terminal/*` + 标志 + 标签标记为延期）。                                                                                                                                                                     |
仍然延迟（未改变）：WebSocket + HTTP/2；`DELETE`/所有权的每连接密钥（token + 单工作区仍然是边界）；严格的 prompt 结果排序屏障；`as never` 桥接边界转换（有针对性，已在适配器类型后续中说明）。

---

## 14. 审查第 5 轮 — PR 合并项

再次进行审查（qwen3.7-max）。套件 **26 个测试**，已实时重新验证。

| #   | 严重度 | 发现                                                                                                                                                                                                                                                                                                                                                       | 修复                                                                                                                                                                                                                                 |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **P0** | `resolveClientResponse` 在调用 `respondToSessionPermission` **之前**就删除了待处理条目。格式错误的投票（`result: {}`）会导致桥接中介器抛出异常——而由于待处理条目已消失，`abandonPendingForSession` 无法取消它，因此 agent 的 prompt 会挂在一个永远不会解析的投票上（持有 token 的人可以通过一次错误的 POST 来阻塞会话）。 | 将投票包装在 try/catch 中；任何失败时回退到 `cancelAbandonedPermission`，以便中介器始终能被释放。新增测试覆盖格式错误投票路径。                                                                                                        |
| D2  | **P1** | 会话流 `onClose` 仅中止了事件泵，未中止 `binding.promptAbort` ——客户端断开连接（关闭标签页/网络断开）会导致正在进行的 prompt 持续运行（消耗配额 + FIFO），直到空闲 TTL 到达。                                                                                                                                                                              | `onClose` 现在也会中止会话的 `promptAbort`。                                                                                                                                                                                         |
| D3  | **P1** | 当 `pumpSessionEvents` 拒绝时，`.catch` 仅记录了日志——SSE 流仍保持打开状态并发送心跳，但不传递任何内容（僵尸流，无重连信号）。                                                                                                                                                                                                                             | `.catch` 现在也会调用 `closeSessionStream(sessionId)`。                                                                                                                                                                              |

---

## 15. 审查第 6 轮 — PR 合并项

再次进行审查（qwen3.7-max）。套件 **28 个测试**，已实时重新验证。

| #   | 严重度 | 发现                                                                                                                                                                                                                                  | 修复                                                                                                                                                                                                                                                                                                                                        |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | **P0** | `handlePrompt` 覆盖了 `binding.promptAbort`，却没有中止之前的控制器——同一个会话的两个并发 `session/prompt` 导致第一个 prompt 被孤立（在桥接 FIFO 中运行到完成，无法被 `session/cancel` 中止）。                                               | 在安装新的 `promptAbort` 之前中止之前的。已添加测试。                                                                                                                                                                                                                                                                                       |
| E2  | **P0** | `subscribeEvents` 抛出异常的路径发送了 `stream_error` 通知，然后 `return`（已解析）——调用者的 `.catch` 从未触发，留下一个僵尸 SSE 流（心跳，无事件，无重连信号）。                                                                          | 在通知之后重新抛出，以便调用者的 `.catch` 关闭流。测试断言 prompt 已关闭。                                                                                                                                                                                                                                                                    |
| E3  | **P1** | SSE 心跳未标记连接为活跃——一个超过 30 分钟无中间事件的长 prompt 会被闲置回收（流和 prompt 被杀死）。                                                                                                                                    | `SseStream` 接受一个 `onHeartbeat` 钩子；两个 GET 处理程序都传入 `() => conn.touch()`。                                                                                                                                                                                                                                                     |
| E4  | **P2** | `pumpSessionEvents` 的 `.catch` 按 sessionId 关闭流——在抛出和微任务之间的重连可能会杀死**新**流。                                                                                                                                         | 身份守卫：仅当 `binding.stream` 仍然是此流时才关闭。                                                                                                                                                                                                                                                                                        |
| E6  | **P2** | `sendSession` 自动创建了一个绑定——`closeSessionStream` 之后迟到的 pump/reply 帧会导致恢复一个幽灵绑定，该绑定会无限缓冲最多 256 帧。                                                                                                       | `sendSession` 现在仅查找：当会话没有活跃绑定时丢弃帧。                                                                                                                                                                                                                                                                                      |
| E5  | 已接受 | `session/load`/`resume` 在另一个活跃连接拥有该会话时不会拒绝（"劫持"）。                                                                                                                                                                  | **已接受，未更改：** 守护进程的信任边界是 bearer token + 单工作区绑定，多客户端附加是故意的（桥接设计为多客户端；REST 具有相同的特性）。持有 token 的人无法获得他们通过 REST 无法获得的能力。与其他 token 边界项一起跟踪（DELETE 所有权，§13）。                                                                                              |

---

## 16. 审查第 7 轮 — PR 合并项

再次进行审查（qwen3.7-max）。套件 **30 个测试**，已实时重新验证。

| #   | 严重度 | 发现                                                                                                                                                                                                              | 修复                                                                                                                                                                                                             |
| --- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **P0** | 并发 `session/close` TOCTOU：`ownedSessions.delete` 仅在 `finally`（在 await 之后）中运行，因此两个并发 close 都通过了 `requireOwned` → 第二个 close 产生误导性错误 + 多余的桥接关闭。                                   | 在 await **同步**删除所有权门控；桥接 close 只运行一次。已添加测试。                                                                                                                                                |
| F2  | **P1** | Pump 生命周期：CLEAN 迭代器结束（子进程结束，`done`）已解析 → `.catch` 从未触发 → 僵尸流；以及**流中间**的迭代器错误未发送 `stream_error`。                                                                          | `pumpSessionEvents` 包装整个循环（同步和流中间错误发送 `stream_error` 然后重新抛出）；消费者 `.then(onDone, onErr)` 在**两条路径**上都关闭流（身份守卫）。已添加测试。                                              |
| F3  | **P2** | 503 连接上限拒绝没有 stderr 日志。                                                                                                                                                                                  | 添加 `writeStderrLine` 并输出上限值。                                                                                                                                                                            |
| F4  | **P2** | `_qwen/notify stream_error` 的展开导致 `event.data.kind` 遮蔽了鉴别器。                                                                                                                                              | 先展开，然后固定 `kind: 'stream_error'`。                                                                                                                                                                        |
| F5  | **P2** | `MAX_WORKSPACE_PATH_LENGTH` 被重新声明（`= 4096`），与规范的 `fs/paths.js` 不同。                                                                                                                                    | 从 `../fs/paths.js` 导入（无分歧）。                                                                                                                                                                             |
| F6  | **P2** | `isObjectParams` 复制了 `json-rpc.isObject`。                                                                                                                                                                       | 导入 `isObject`。                                                                                                                                                                                               |
| F7  | **P2** | `index.ts`/`sse-stream.ts` 中使用原生 `process.stderr.write`，而其他地方使用 `writeStderrLine`。                                                                                                                    | 统一为在整个模块中使用 `writeStderrLine`。                                                                                                                                                                       |

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

## 18. 审查第 9 轮 — PR 合并项

| #   | 严重度             | 发现                                                                                                                                                                                                                                                                                     | 修复                                                                                                                                                                                     |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **P1 (回归)**     | 会话流重连中止了正在进行的 prompt：`attachSessionStream` 在安装新流之**前**关闭了旧流，而旧流的 `onClose` 无条件中止了 `promptAbort`——因此重新连接的客户端（网络抖动/漫游）丢失了其正在运行的 prompt。                                                                                        | 先安装新流，再关闭旧流；身份守卫 `onClose` 的 prompt 中止（仅在此流仍然是会话的活跃流时才中止）。已添加测试（prompt 在重连后存活）。                                                      |
| G2  | **P2**             | `session/cancel` 传递了 `undefined` 作为 `CancelNotification` 主体，丢弃了客户端提供的取消字段（reason/context），而 REST 会转发这些字段。                                                                                                                                                 | 转发 `{ ...params, sessionId }`（与 REST 一致）。                                                                                                                                        |

已变基到最新 `daemon_mode_b_main`（#4473/#4483/#4484/#4500），无冲突。套件 **33 个测试**，已实时重新验证。

---

## 19. 路线图 / 后续 PR（防遗忘）

本 PR（#4472）= ACP Streamable HTTP transport + **全部 bridge-backed 能力对齐** + 官方扩展方案。已转 **ready**。达到「`/acp` 完全等价 REST+SSE」尚需：

1. **Follow-up PR 1 — acp-bridge 能力补齐（前置 / bridge-first）**：`HttpAcpBridge` 新增 文件 I/O、设备流、agents CRUD、memory CRUD 方法；REST 路由改走 bridge（消除直连 route 级服务的漂移）。
2. **Follow-up PR 2 — `/acp` 剩余对齐（依赖 PR 1）**：`_qwen/fs/*`、`_qwen/auth/*`、`_qwen/workspace/agent*`、`_qwen/workspace/memory*` → 完全等价 REST。

跟踪：#3803（开放决策）、#4175（Mode B 路线图）均已评论。
延迟硬化项见 PR 描述「已知延迟」。

---

## 20. 扩展命名空间重命名 + SDK 传输分析（round 11）

- **命名空间 `_qwen.ai/` → `_qwen/`**：ACP 的唯一硬性规则是前导 `_`；`_zed.dev/` 域段是约定示例，不是必须要求。由于 `qwen` 具有辨识度，我们使用更短的裸形式。`_meta` 键同样为 `"qwen"`。（对实际 agent 的调查：Zed/gemini-cli 大多使用标准方法上的 `_meta` + ACP 自身的 `unstable_*`；裸自定义 `_` 方法很少见——我们的 `_qwen/*` 是真正新的工作区/会话操作，没有标准等效项，因此 `_` 方法是正确的工具。）
- **为何使用手写传输（不基于 SDK）**：TS SDK 仅提供 `ndJsonStream`（stdio）；RFD #721 HTTP 是 SDK 第三阶段（尚未实现）。SDK 的 `Connection` 是单双工流；我们的传输是多流（POST + 连接级 SSE + 每会话 SSE），需要按 sessionId 进行出站解复用——我们的分发器在路由时已经知道这一点。完全重写为 SDK 会与这种模型冲突，并且不会减少大量的代码（桥接翻译、SSE 生命周期、所有权、EventBus→JSON-RPC）。**务实的改进（候选后续工作）**：采用 SDK 的 Zod 模式验证器和类型用于参数验证，同时保留手写传输。使用 `extMethod('_qwen/…')` 的 SDK 客户端与我们的处理程序互操作（相同的线格式）。