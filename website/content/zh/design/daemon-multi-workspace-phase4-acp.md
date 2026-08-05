# Daemon 多工作空间 Phase 4：工作空间限定的 ACP

## 摘要

本文档设计 issue #6378 的 Phase 4：`qwen serve` 的工作空间限定 ACP。它直接构建在 Phase 3 工作空间限定 REST 分支（`codex/phase3-workspace-qualified-rest`，PR #6567）之上，该分支**尚未合并**（状态 `CHANGES_REQUESTED`）。Phase 4 在 `/workspaces/:workspace/acp` 挂载一个每工作空间的 ACP 端点，为每个工作空间运行时提供自己的 ACP dispatcher 和连接状态，并让 Web Shell 从 `/capabilities` 中选择一个工作空间。旧式 `/acp` 保持绑定到主运行时，因此现有的 Web Shell 和 ACP 客户端不受影响。

Phase 4 的范围是 ACP 传输（Streamable HTTP + 反向 `/acp` WebSocket、其镜像的工作空间方法，以及反向 MCP/CDP）。语音（`/workspaces/:workspace/voice/stream`）和 daemon 管理的 channel worker 是 **Phase 4b**；动态工作空间添加/移除是 **Phase 5**。两者都不在本文档范围内。

接缝调查的核心发现：Phase 4 主要是一个_接线和路由_变更，而不是重写。`AcpDispatcher` 按构造就已经是工作空间绑定的，其 `workspaceCwd` 一致性检查已经存在，Phase 3 已经让镜像的 REST 面变为每运行时，`clientMcpSenderRegistry` 已经是一个每运行时字段。真正的工作是：(1) 把单一 ACP 挂载变成一个每运行时的 dispatcher（每个都有自己的 remember-lane；仍然只有一次 `mountAcpHttp` 调用和一个 upgrade 监听器；一个拥有每个运行时 registry 的 `AcpHttpHandle`），(2) 扩展该 WebSocket upgrade 监听器以按 URL 路径分发，(3) 让 device-flow registry 保持 daemon 全局并在所有挂载之间共享（对每个受信任运行时的 bridge 做尽力而为的事件接收端扇出），以及 (4) 在 SDK/CLI 能力类型和测试中同步新的 `workspace_qualified_acp` 能力标签。

## 系统性返工（加固，PR #6621）

评审暴露了一个 Critical：较早的一次迭代把 device-flow registry 做成了每运行时的，导致次级挂载处于未认证状态（`device_flow "not configured"`）。ACP 挂载沿八个轴线返工；最终架构是：

1. **运行时 ACP 挂载工厂。** 一次 `mountAcpHttp` 调用拥有一个 `primaryMount` 加一个 `secondaryMounts` 映射（每个非主运行时一个 `RuntimeAcpMount`），每个都带一个 `primary` 标志。HTTP 和 WS 都通过选择器解析一个挂载并委托给共享处理器。
2. **路由 + 连接隔离。** 复数选择器把主工作空间别名到 `primaryMount`，其他情况解析到一个每运行时的挂载。不受信任的非主工作空间在 HTTP 和 WS 两条路径上都在任何子进程 spawn 之前被拒绝（403）。
3. **原始请求目标 WS 解析。** upgrade 监听器解析原始请求目标（而不是会归一化 `%2e%2e` 的 `new URL().pathname`），因此未归一化的点段/反斜杠选择器在路由之前就被销毁。
4. **daemon 全局 device-flow + 扇出。** device-flow registry 保持为单个 daemon 实例（OAuth 凭据是进程全局的）。次级挂载通过 `opts.deviceFlowRegistry` 共享它；auth-flow 事件尽力而为地扇出到每个受信任运行时的 bridge（`resolveEventBridges`）。
5. **仅主 CDP + client-MCP。** CDP 隧道认领以 `activeMount.primary` 为闸门；复数 POST 返回分发 promise。
6. **已 dispose 的生命周期闸门。** `dispose()` 之后，共享 HTTP 处理器返回 `503 server_disposed`，而不是在关闭 drain 期间与已拆除的 registry 竞争。`dispose()` 是幂等的。
7. **聚合可观测性。** `AcpHttpHandle.getSnapshot()` 对主挂载和每个次级挂载的连接数和 WS 流计数求和，使 daemon 指标报告所有工作空间的 ACP 连接，而不只是主工作空间的。
8. **能力通告。** `resolveAcpHttpEnabled()` 是 `QWEN_SERVE_ACP_HTTP` 的唯一解释；只有当 ACP HTTP 面启用**且**多工作空间会话活跃时，才通告 `workspace_qualified_acp`。

## 评审后的接缝加固

上述挂载架构保持不变。最终修复轮次在不替换 `AcpHttpHandle` 也不引入新的路由策略模块的前提下，关闭了六个边界缺口。

1. **一个限定路由就绪判定。** 只有当 ACP HTTP 启用且工作空间 registry 包含多个运行时时，工作空间限定 ACP 才是就绪的。HTTP 路由注册、WebSocket 路径识别、能力通告和外层限流豁免必须与该判定一致。单工作空间 daemon 继续只暴露旧式 `/acp`。
2. **一次限流计费。** 外层 Express 限流器精确豁免启用的 `/workspaces/<single-selector>/acp` 传输路径，包括该路由现有的大小写和结尾斜杠行为。邻近路径仍然受限。ACP 传输继续负责应用 JSON-RPC 方法分级，因此一个限定 prompt 只消耗 prompt 桶，而不是同时消耗 mutation 和 prompt 两个桶。
3. **结构化格式错误路径失败。** 既是 `URIError` 实例又带 HTTP 状态 400 标记的 Express 路由参数解码失败，返回结构化的 `400 invalid_request`。其他抛出的 `URIError` 值和不相关的失败保留通用的 500 处理。WebSocket 路径保持其现有的显式 400 响应。
4. **日志安全的选择器。** 用于面向运维的 WebSocket 拒绝日志中的已解码选择器，会经过现有的 `logSafe` 净化器，因此编码的终端控制符无法伪造或切断 stderr 行。
5. **终态 dispose。** `dispose()` 是一个不可逆的生命周期转换。它运行之后，`attachServer()` 无法重新创建 WebSocket 服务器或 upgrade 监听器。重复的 `dispose()` 和 `attachServer()` 调用保持无害。
6. **带工作空间归因的完整诊断。** 聚合 ACP 快照获得增量的连接诊断，装饰以 `workspaceId`、`workspaceCwd` 和 `primary`。汇总计数器保持不变，公开的主 `registry` 为兼容性保持可用，daemon `detail=full` 读取聚合连接列表。现有连接上限保持为每挂载限制，因为每个挂载都以相同的配置上限构造。

每个契约都由一个在生产变更之前编写的回归测试钉住。验证包括聚焦的 ACP、限流、daemon-status 和 serve-server 套件，外加 build、typecheck、lint 和 serve 快路径 bundle 闭包检查。

## 对 Phase 3（未合并）的依赖

Phase 4 消费这些 Phase 3 接缝。由于 PR #6567 处于 `CHANGES_REQUESTED`，把它们视为_待稳定_；Phase 4 实现必须 rebase 到合并后的 Phase 3 上。

- `packages/cli/src/serve/workspace-route-runtime.ts`：
  - `resolveRegisteredWorkspaceRuntimeByPathSelector(registry, selector)` — 纯函数，返回 `WorkspaceRuntime | undefined`。**可被 WS upgrade 监听器复用**（见开放问题）。
  - `resolveWorkspaceRuntimeFromParam(registry, req, res, param)` — Express 绑定（写入 `res.status().json()`）。**可用于 HTTP ACP 路由，不能用于 WS upgrade 路径**（upgrade 监听器只有原始 `IncomingMessage` + `socket`，没有 Express `res`）。
  - `requireTrustedWorkspaceRuntime(runtime, res)` — Express 绑定的信任闸门，由 HTTP ACP 路由复用。
  - `isPortableAbsolutePath` / `sendWorkspaceMismatch` — 复用于选择器解析和错误形状。
- 在 `server.ts` 注册的每运行时 REST 处理器（`registerWorkspaceQualified{FileRead,FileWrite,Trust,Status,Permissions,Settings,Lifecycle,McpControl,Tools}Routes`）。ACP dispatcher 镜像这些面；Phase 4 依赖它们的每运行时行为已经存在。
- `/capabilities` `workspaces[]`（Phase 2a），构建于 `packages/cli/src/serve/routes/capabilities.ts`（L79-84），并在 `packages/cli/src/serve/daemon-status.ts`（L432-437）中镜像，每运行时带 `id` / `cwd` / `primary` / `trusted`。功能开关声明及其通告/切换谓词位于 `packages/cli/src/serve/capabilities.ts`。

## 基线：当前 ACP 接缝（Phase 3 树）

- `packages/cli/src/serve/acp-http/index.ts` 中的 `mountAcpHttp(app, primaryBridge, opts)` 从 `server.ts`（L1226-1275）被调用一次，输入**全部是主的**：`primaryBridge`、`primaryBoundWorkspace`、`primaryWorkspace`、`primaryRouteFileSystemFactory`、应用全局的 `deviceFlowRegistry`、`primaryRuntime.clientMcpSenderRegistry`，以及 `primaryRuntime.env`（用于语音 `extraWsRoute`）。
- 每挂载一个 dispatcher：`mountAcpHttp` 构建单个 `AcpDispatcher` 和单个 `ConnectionRegistry`，并返回一个 `AcpHttpHandle`，其 `registry` 就是那个单一 registry，其 `attachServer` 安装恰好一个 `httpServer.on('upgrade', ...)` 监听器（index.ts L1536, L1555）。`dispose` 移除那一个监听器并关闭那一个 registry（index.ts L1543-1553）。
- **单个 WebSocket upgrade 监听器**（index.ts `setupWebSocket`，upgrade 处理器在 L903-1045）。它在 `listen()` 之后通过 `AcpHttpHandle.attachServer(server)` 安装一次。它：
  - 解析 upgrade URL，
  - 拒绝任何不是 `opts.path`（`/acp`）、不是 `/cdp`、也不是 `extraWsRoutes` 条目的路径 — 未知路径时 `socket.destroy()`（index.ts L935-939），
  - 对**所有**路径运行共享的安全检查（回环、host 允许列表、CSRF/origin、bearer token），
  - 然后分支：`/cdp` -> `attachCdpClient`；`extraRoute` -> `onConnection`；否则 ACP initialize 握手。
  - L328-337 的文档注释是明确的：第二个 `'upgrade'` 监听器无法共存，因为这一个是销毁未知路径的。Phase 4 必须扩展这一个监听器，而不是新增另一个。
- `AcpDispatcher`（dispatch.ts L644-656）按构造函数就已经是工作空间绑定的：`bridge`、`boundWorkspace`、`workspace`、`workspaceRememberLane`、`fsFactory?`、`deviceFlowRegistry?`、`sessionShellCommandEnabled`、`registry?`、`archiveCoordinator`。它服务的每个镜像工作空间方法都读取这些字段，因此把 dispatcher 绑定到一个运行时会自动把 file / permissions / settings / trust / tools / mcp / memory / agents / auth 限定到该运行时。
- 这些 dispatcher 依赖中有两个目前是绑定到主运行时的单实例：`workspaceRememberLane = new WorkspaceRememberTaskLane(primaryBridge)`（server.ts L816）和 `archiveCoordinator = new SessionArchiveCoordinator()`（server.ts L596）。`sessionShellCommandEnabled` 是全局策略，可以安全共享。
- 一致性检查已经存在：`parseRequestedWorkspace`（dispatch.ts L694-697）在请求的 `workspaceCwd` 不等于 `this.boundWorkspace` 时抛出 `WorkspaceMismatchError`；该错误映射到 `INVALID_PARAMS`（L577）。
- `WorkspaceRuntime`（workspace-registry.ts L28-38）每运行时携带 `clientMcpSenderRegistry`，但**没有 `deviceFlowRegistry` 字段** — device-flow 仍然是应用全局的（server.ts L609 的 `setupDeviceFlowRegistry({ app, bridge })`，绑定到主 bridge）。

## 架构：每运行时 ACP 挂载

保留选项 B：一个 daemon，N 个独立的工作空间运行时。对 ACP：

- 每个已注册运行时获得自己的 `AcpDispatcher` + `ConnectionRegistry` + 反向 MCP provider 工厂，全部绑定到该运行时的 `bridge` / `workspace` / `routeFileSystemFactory` / `clientMcpSenderRegistry` / `env`。每个 dispatcher 接收同一个 daemon 全局 device-flow registry。
- 旧式 `/acp` 保持绑定到主运行时的 dispatcher（线缆行为不变）。
- 新的 `/workspaces/:workspace/acp` 绑定到所解析运行时的 dispatcher。
- **不变量：`mountAcpHttp` 仍然恰好被调用一次**，并安装恰好一个 `httpServer.on('upgrade', ...)` 监听器。它从“单 bridge + opts”变为接受 `WorkspaceRegistry`（加上共享的、非工作空间关注点：token、allowedOrigins、hostname、`checkRate`、`sessionShellCommandEnabled`、`cdpTunnelRegistry`）。内部构建一个 `Map<workspaceId, RuntimeAcpMount>`；主条目保持可通过旧式 `/acp` 路径寻址。
- 每个 `RuntimeAcpMount` 以该运行时自己的 `bridge`、`workspace`、`routeFileSystemFactory`、`clientMcpSenderRegistry`、`env`、一个新的每运行时 `WorkspaceRememberTaskLane(runtime.bridge)`、其 `AcpDispatcher` 和其 `ConnectionRegistry` 构造。daemon 全局 device-flow registry、`archiveCoordinator` 和 `sessionShellCommandEnabled` 是共享的。
- 所有四个分发入口都必须选择所解析运行时的挂载，而不是主的：复数路径上的 `POST`、`GET`（SSE）和 `DELETE`（Express，通过 `resolveWorkspaceRuntimeFromParam`；目前每个都在 index.ts L533/L675/L849 闭包捕获单一 dispatcher），加上 WS upgrade 分支（见下）。旧式 `/acp` POST/GET/DELETE/upgrade 继续分发到主运行时。
- `AcpHttpHandle` 必须从单一 `registry` 成长为拥有每个运行时的 dispatcher + `ConnectionRegistry`；`dispose` 关闭它们全部并移除那一个 upgrade 监听器。
- 会话生命周期：复数挂载上的 ACP `session/new` / `load` / `resume` 必须触发同样的 bridge 生命周期 `register` / `remove` 回调，以喂给 Phase 2b 的 `WorkspaceSessionOwnerIndex`（workspace-registry.ts L48-119）。通过 `/workspaces/B/acp` 创建的会话必须随后可被 REST owner 路由读取（context、stats 等）发现，反之亦然。Phase 2b 已经把该索引的范围定为覆盖“REST 和后续的 ACP dispatcher”；Phase 4 是 ACP 侧真正接线的地方。

## WebSocket upgrade 分发（核心设计）

upgrade 监听器是 ACP 路由不由 Express 驱动的唯一位置，因此需要显式的路径处理。

- 共享安全检查（回环 / host 允许列表 / CSRF / bearer）保持原样，在任何工作空间解析之前统一应用。
- 扩展路径分类。目前：`pathname === '/acp' | '/cdp' | extraRoute`。Phase 4 为 `/workspaces/:workspace/acp` 增加一个分支：
  1. 匹配前缀并提取原始的 `:workspace` 选择器段。
  2. 用纯函数 `resolveRegisteredWorkspaceRuntimeByPathSelector(registry, decodeURIComponent(selector))` 解析（先 id，再编码的规范 cwd，与 REST 解析器一致）。
  3. 无匹配时：以 400 类关闭拒绝 upgrade（`socket.write('HTTP/1.1 400 ...')` + `destroy()`），镜像 REST 的 `workspace_mismatch`。不回退到主运行时。
  4. 匹配时：对所解析运行时的 dispatcher + `ConnectionRegistry`（而不是主的）运行 ACP initialize 握手。
- 反向 `/cdp` 和语音 `extraWsRoutes` 在 Phase 4 保持绑定主运行时（语音是 4b）。`/cdp` 分支不变。
- 旧式 `/acp` upgrade 继续绑定到主 dispatcher。
- 编码 cwd 选择器中的 `%2F`：daemon 自己解析原始 upgrade URL（`new URL(req.url, ...)`），因此不受 Express 路径解码影响，但反向代理仍可能归一化 `%2F`。在代理部署中建议 WS 使用基于 `id` 的选择器（与 Phase 2b/3 REST 相同的指导）。HTTP 复数路由则复用 `resolveWorkspaceRuntimeFromParam`，它读取 `req.params`（Express 解码一次），因此免费继承 Phase 3 的编码选择器处理。
- 可观测性：WS upgrade 路径及其 ACP 分发绕过 Express 中间件，因此 daemon 遥测/日志必须在这里显式盖上所解析工作空间的戳（与 `checkRate` 通过 `opts` 穿线相同的原因）；Phase 1 的请求时工作空间哈希只覆盖 Express 路由。

## 每运行时 device-flow registry（已被取代 — 见“系统性返工”轴线 4）

> **已被取代。** 本节是返工前的设计（每运行时 device-flow registry）。评审发现它使次级挂载处于未认证状态，因此发布的实现改为保持单个 daemon 全局 registry 由所有挂载共享，并做尽力而为的事件接收端扇出 — 见上文“系统性返工”轴线 4。以下小节仅作为设计历史背景保留，不描述已发布的行为。

Device-flow 是唯一一个仍然是应用全局且必须改变的镜像面。

- 向 `WorkspaceRuntime` 添加 `deviceFlowRegistry`（或在 `mountAcpHttp` 内部为每个运行时构建一个）。每个运行时的 dispatcher 接收自己的 registry。
- `setupDeviceFlowRegistry` 必须按运行时调用（绑定到该运行时的 bridge/env），而不是只对主 bridge 调用一次。
- 工作空间限定的 auth 路由/方法（`GET/DELETE /workspaces/:workspace/auth/device-flow/:id` 和 ACP `_qwen/workspace/auth/device_flow/*` 方法）必须解析目标运行时的 registry，并拒绝/隐藏属于其他工作空间的 flow。
- 关闭必须 dispose 每个运行时的 registry，而不只是 `app.locals.deviceFlowRegistry`。
- Auth provider 安装回调在 dispatcher 内部已经是 `boundWorkspace` 作用域的；每运行时 dispatcher 使这一点自动正确。旧式主 auth 路由继续写主运行时。

## Dispatcher 镜像面（运行时绑定）

反向 `/acp` WS 镜像了一个庞大的 REST 面（index.ts `WS_READ_METHODS` L186-219 和 dispatch.ts 厂商方法）：文件 read/list/glob/stat，工作空间 mcp / skills / providers / env / preflight / trust / permissions / voice / tools / agents / memory / auth，会话组，setup-github。由于这些都读取 dispatcher 的构造函数字段，把 dispatcher 绑定到一个运行时就会免费限定它们。Phase 4 **不**重新实现它们；它只确保每个运行时的 dispatcher 以该运行时的依赖构造。该集合显式包括每运行时的 `deviceFlowRegistry` 和 `WorkspaceRememberTaskLane`：如果其中任何一个保持为主单例，非主的 `_qwen/workspace/memory/remember` 和 `auth/device_flow` 调用会悄悄对着主 bridge 运行。

一致性保证：由于每个挂载的 dispatcher 都是运行时绑定的，且 `parseRequestedWorkspace` 已经在请求的 `workspaceCwd` 与 `boundWorkspace` 不同时抛出 `WorkspaceMismatchError`，连接到 `/workspaces/A/acp` 但在参数中发送 `workspaceCwd: B` 的客户端会被拒绝。Phase 4 应增加一个断言此行为的测试，并确认同一守卫覆盖 `session/new`（`parseOptionalWorkspaceCwd`，dispatch.ts L1059）。

## 反向 MCP / CDP 隔离

- 反向工具通道：`clientMcpProviderFactory` 目前闭包捕获 `primaryRuntime.clientMcpSenderRegistry` + `primaryBridge`（server.ts L1252-1257）。每运行时挂载从_所解析运行时的_ `clientMcpSenderRegistry` + `bridge` 构建工厂，因此 `/workspaces/B/acp` 上的 WS 连接只在 B 的运行时中注册客户端托管的 MCP 服务器。
- 每连接的 `ClientMcpWsConnection` 和 `cdpEndpoint` 保持每连接；它们只是附加到所属运行时的 dispatcher。
- CDP 隧道：`cdpTunnelRegistry` 是进程作用域的，CDP bridge 由 `clientInfo.name === 'qwen-cdp-bridge'` 的扩展 `/acp` 连接认领。Phase 4 把 CDP 认领保留在旧式 `/acp`（主）上作为务实的默认值；按工作空间作用域的 CDP 被列为开放问题而不是在这里解决，因为单个回环 puppeteer 客户端 + 一个 `/cdp` 端点无法干净地映射到 N 个运行时。具体而言，非主 `RuntimeAcpMount` 必须保持 `cdpTunnelOverWs` / `/cdp` 分支和 `chrome-devtools` runtime-MCP 注册关闭；只有主挂载接线它们。

## 信任闸门

- 不受信任的已注册工作空间保持可见/只读，但不得 spawn 子进程。在 `/workspaces/:workspace/acp` 上，授予所有权的操作（`session/new`、`session/load`、`session/resume`；dispatch.ts `CONN_ROUTED_METHODS` L239-243）必须以 `untrusted_workspace` 错误拒绝且不 spawn，与 `routes/session-runtime.ts`（L39-53）和 `routes/session.ts`（会话创建/load/resume 信任闸门加 `session_workspace_conflict`）中已实现的 REST 403 `untrusted_workspace` 语义一致。
- 为 HTTP ACP 路由复用 Phase 3 通过 `requireTrustedWorkspaceRuntime` 暴露的信任决策；对 WS 路径，等价检查在握手授予会话之前对所解析运行时的 `trusted` 标志运行。
- 启动冻结的信任是 Phase 2a 基线；运行时信任翻转（撤销时 drain/停止该工作空间的 ACP 子进程 + 清除其会话索引）与落地的任何信任变更阶段保持一致，不在这里重新实现。

## 能力与 Web Shell 选择器

- 在 `packages/cli/src/serve/capabilities.ts` 中添加一个 ACP 功能开关（例如 `workspace_qualified_acp`）（标志声明 + 通告/切换谓词），只在注册了多个运行时且 ACP 启用时通告（镜像 capabilities.ts L408-409 的 `multi_workspace_sessions` 门控）。如果 Phase 4 分多个 PR 落地，在完整的复数 ACP 循环（HTTP + WS + device-flow + owner 索引接线）完成之前不要通告该标签，使客户端永远不会对着一个半接线的面构建 `/workspaces/:id/acp` URL（与 Phase 2a 功能门相同的半启用守卫理念）。更新 `workspace_qualified_rest_core`（L264-271）上目前写着“本阶段 ACP/WebSocket、auth、voice 和 extensions 保持在现有主工作空间路由上”的注释。
- 添加该标签并不局限于 `capabilities.ts`。它必须同步到：`routes/capabilities.ts` 中的 `/capabilities` 响应构建器、SDK 能力类型（`packages/sdk-typescript/src/daemon/types.ts`）、CLI serve 类型（`packages/cli/src/serve/types.ts`），以及 `server.test.ts`（L376-381）中的功能集断言。这是必需的 Phase 4 工作，不是可选的。
- `workspaces[]` 已经存在（Phase 2a），构建于 `routes/capabilities.ts`（L79-84）和 `daemon-status.ts`（L432-437），每运行时带 `id` / `cwd` / `primary` / `trusted`。Web Shell 读取它并构建 `/workspaces/:id/acp` 连接 URL；选择器禁用（或只读标记）不受信任的条目。
- SDK `DaemonClient`（Phase 3 新增）已经读取 `caps.workspaces[].cwd` 用于会话路由；一个工作空间限定的 ACP 连接 helper 是自然的扩展。上述能力类型同步是必需的；连接 helper 本身可以随后跟进。

## 失败路径

- `workspace_mismatch`：未知 WS/HTTP 选择器 -> 400 类拒绝；绝不回退到主运行时。
- `untrusted_workspace`：对不受信任运行时的授予所有权的 ACP 操作 -> 拒绝，不 spawn。
- `workspaceCwd` 参数不匹配：`WorkspaceMismatchError` -> `INVALID_PARAMS`（已接线）。
- 子进程崩溃：隔离在所属运行时内；其他运行时的 dispatcher 和连接不受影响（更大的单 daemon 故障半径是已记录的已知限制）。
- 信任撤销：当信任变更阶段落地时，撤销一个运行时必须 drain/停止其 ACP 子进程并清除其会话索引；Phase 4 只保证每运行时 ACP 挂载是可 drain 的，它本身不添加信任变更。
- 全局关闭：dispose 每个运行时的 `ConnectionRegistry`，然后对单个 daemon 全局 device-flow registry dispose 一次。
- 限流：ACP HTTP/WS 准入使用按连接/会话键控的 `checkRate`（index.ts L627-641, L1175-1178）。复数挂载共享同一个限流器；键必须在运行时之间保持不歧义，使一个工作空间无法耗尽或绕过另一个的预算。
- 容量：`maxConnections` 按每运行时 `ConnectionRegistry` 强制执行，因此 ACP 总连接数扩展到 N x `maxConnections`（每工作空间预算，与每工作空间的 `maxSessions` 模型一致）。全新会话总量仍然受 bridge 接缝处 Phase 2a `maxTotalSessions` 准入的约束，ACP 会话创建已经经过它。

## 非目标（Phase 4b / 5）

- `/workspaces/:workspace/voice/stream` 和每工作空间语音设置（4b）。
- daemon 管理的 channel worker 分组 / pidfile / 状态（4b）。
- 动态工作空间添加/移除和惰性运行时创建（5）。

## 测试策略

- WS upgrade 分发：单元测试路径分类 — `/acp`（主）、`/workspaces/:id/acp`（已解析）、未知选择器（拒绝）、`%2F` 编码的 cwd 选择器，以及共享安全检查仍对复数路径运行。
- 跨工作空间隔离：`/workspaces/A/acp` 上的连接无法看到或驱动 B 拥有的会话；`session/list` 和镜像读取只返回 A 的视图。
- 跨传输所有权：通过 `/workspaces/B/acp` 创建的会话可被 REST owner 路由读取（例如 `GET /session/:id/stats`）和 `resolveLiveSessionOwner` 解析，确认 ACP 创建喂给 owner 索引。
- 一致性：连接到 A，发送 `workspaceCwd: B` -> `WorkspaceMismatchError`。
- 信任闸门：对不受信任运行时的 `session/new|load|resume` -> 被拒绝，没有子进程被 spawn。
- Device-flow：每个挂载都到达 daemon 全局 registry；事件发布扇出到主和受信任次级 bridge，一个失败的 bridge 不阻塞其他，关闭对 registry dispose 一次。
- 反向 MCP：`/workspaces/B/acp` 上的 `mcp_register` 只落在 B 的 `clientMcpSenderRegistry` 和 B 的 bridge 中。
- 限流：`/workspaces/A/acp` 和 `/workspaces/B/acp` 上的 prompt/mutation 独立计量，两者都不能绕过共享限流器。
- 能力：`workspace_qualified_acp` 只在运行时数大于 1 时通告；`workspaces[]` 形状不变。

## 开放问题 / 对 Phase 3 的反馈

1. **保持 `resolveRegisteredWorkspaceRuntimeByPathSelector` 为纯函数。** WS upgrade 监听器无法使用 Express 绑定的 `resolveWorkspaceRuntimeFromParam`。Phase 4 依赖纯解析器保持无 `req`/`res` 耦合。如果 Phase 3 评审改变了该接缝，保留一个纯的 `(registry, selector) => runtime | undefined` 入口点。
2. **Device-flow 所有权（已解决）。** 保持 registry 为 daemon 全局，因为 OAuth 凭据是进程全局的。Phase 4 与每个 dispatcher 共享该 registry，并把净化后的事件扇出到受信任运行时的 bridge。
3. **CDP 隧道的每工作空间模型。** 一个回环 puppeteer 客户端 + 一个 `/cdp` 端点无法干净地映射到 N 个运行时。Phase 4 把 CDP 保留在主运行时上；确认这是否可接受，或者为工作空间限定的 CDP 立项后续工作。
4. **语音延迟。** 确认即使 ACP dispatcher 已经暴露 `_qwen/workspace/voice` 读取，语音在 Phase 4b 之前仍保持仅主运行时。
5. **`archiveCoordinator` 作用域。** 它目前是单个 `SessionArchiveCoordinator`（server.ts L596）。鉴于 Phase 3 的工作空间限定 archive/organization，确认跨运行时共享它是安全的，或者把它做成每运行时的。
6. **限流键维度。** 决定 ACP 复数准入键是否需要显式的工作空间维度，还是按连接/会话的键在挂载之间已经不歧义。
