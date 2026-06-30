# Daemon 开发者文档

这是面向开发者的 **qwen-code daemon 模式** 技术文档：涵盖 `qwen serve` HTTP daemon、`@qwen-code/acp-bridge` 包、工作区作用域的 MCP transport pool、多客户端权限仲裁、类型化的 daemon event schema v1、TypeScript SDK daemon 客户端，以及连接到 daemon 的各类适配器。

本文档是对以下现有文档的补充，而非替代：

| 现有文档                                                                             | 目标受众              | 权威参考                                                   |
| ------------------------------------------------------------------------------------ | --------------------- | ---------------------------------------------------------- |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                             | 运维人员              | 用户快速入门、命令行参数、威胁模型                         |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                             | 协议实现者            | HTTP 路由目录、请求/响应结构、错误码                       |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md) | SDK 用户              | 端到端 TypeScript 实战指南                                 |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                           | 适配器开发者          | 旧版客户端适配器设计文档                                   |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                   | 适配器开发者          | 客户端适配器设计说明                                       |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)     | F2 维护者             | 工作区 MCP transport pool 设计 v2.2                        |

如果你想**启动并使用 daemon**，请先阅读 `qwen-serve.md`。如果你想**基于线格式构建客户端**，请阅读 `qwen-serve-protocol.md`。如果你想**理解、扩展或调试 daemon 内部机制**，请阅读本文档集。

## 阅读顺序

选择符合你目标的路径：

- **首先启动并验证 daemon**：`20 -> 17 -> 19`。
- **新贡献者**：`01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`。
- **添加新的客户端适配器**：`01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`。
- **开发 MCP pool 或 budget 功能**：`01 -> 03 -> 05 -> 06`。
- **开发权限功能**：`01 -> 03 -> 04 -> 12`。
- **调试生产环境 daemon**：`19 -> 18 -> 17 -> 20`。

## 文档集

### 基础

- [`01-architecture.md`](./01-architecture.md) - 系统架构、进程拓扑、包映射以及所有七个顶层时序图。

### 服务端核心

- [`02-serve-runtime.md`](./02-serve-runtime.md) - `runQwenServe` 引导启动、Express 应用、中间件链、优雅关闭。
- [`03-acp-bridge.md`](./03-acp-bridge.md) - `@qwen-code/acp-bridge` 包内部机制、会话多路复用、channel factory、ACP 子进程生成。
- [`04-permission-mediation.md`](./04-permission-mediation.md) - `MultiClientPermissionMediator`、四种策略、N1 超时不变量、取消哨兵值。
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) - `McpTransportPool` (F2)、池条目、反向索引、重启、排空。
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) - `WorkspaceMcpBudget`、模式（`off`/`warn`/`enforce`）、迟滞效应、拒绝批次合并。
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) - `WorkspaceFileSystem` 沙箱、路径策略、审计、`BridgeFileSystem` 契约。
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) - 创建 / 附加 / 加载 / 恢复、`X-Qwen-Client-Id`、心跳、驱逐、元数据。
- [`09-event-schema.md`](./09-event-schema.md) - 类型化 event schema v1：所有 47 种已知事件类型及其 payload、reducer、向前兼容性。
- [`10-event-bus.md`](./10-event-bus.md) - `EventBus`、单调递增 ID、环形重放、`Last-Event-ID`、慢客户端背压、`client_evicted`。
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - 能力注册表、协议版本、schema 版本、条件通告。
- [`12-auth-security.md`](./12-auth-security.md) - bearer 中间件、主机白名单、CORS 拒绝、变更门控、`--require-auth`、`/health` 豁免、设备流。

### 客户端

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - TypeScript SDK：`DaemonClient`、`DaemonSessionClient`、`DaemonAuthFlow`、SSE 解析器、事件 reducer、`ui/*` 记录层。
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) - 共享 UI 记录层以及旧版 CLI TUI daemon 适配器的关系。
- [`15-channel-adapters.md`](./15-channel-adapters.md) - `DaemonChannelBridge` 共享基类，以及钉钉、微信、Telegram、飞书单通道适配器。
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) - `DaemonIdeConnection`、仅环回强制限制、webview 桥接。

### 参考附录

- [`17-configuration.md`](./17-configuration.md) - 影响 daemon 的环境变量、CLI 参数、`settings.json` 键。
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) - 各层类型化错误及修复方案。
- [`19-observability.md`](./19-observability.md) - `QWEN_SERVE_DEBUG`、调试指南、遥测盲区。
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) - 最短启动路径、curl 检查、路由映射及内嵌调用指南。

## 术语表

- **ACP** - Agent Client Protocol。daemon bridge 与 ACP 子进程之间通过 stdio 进行的 JSON-RPC 通信。这不是客户端用于连接 daemon 的 HTTP 协议。
- **ACP child** - daemon 生成的子进程（`qwen --acp`），用于承载实际的 agent 运行时。bridge 将一个 ACP child 多路复用于多个连接的客户端。
- **acp-bridge** - `@qwen-code/acp-bridge` 包（`packages/acp-bridge/`）。负责会话多路复用、权限仲裁器、事件总线和 channel factory。
- **BridgeClient** - `packages/acp-bridge/src/bridgeClient.ts`。封装单个 ACP `ClientSideConnection`，处理 `requestPermission`、`sendPrompt` 和 `cancelSession`。
- **Channel factory** - 用于生成或附加到 ACP child 的可插拔策略。默认的 `spawnChannel` 将 `qwen --acp` 作为子进程运行；`inMemoryChannel` 则在进程内运行以用于测试。
- **DaemonClient** - `packages/sdk-typescript/src/daemon/DaemonClient.ts`。TypeScript SDK 中面向 daemon 的 HTTP 层外观模式封装。
- **DaemonSessionClient** - `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`。会话作用域的封装，跟踪 `lastSeenEventId` 以用于 SSE 重放。
- **EventBus** - `packages/acp-bridge/src/eventBus.ts`。每个会话的内存发布/订阅系统，具有单调递增 ID、有界环形缓冲区和按订阅者划分的背压机制。
- **F1 / F2 / F3 / F4** - 在 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) 中跟踪的内部里程碑。F1：bridge 提取和 `BridgeFileSystem`。F2：工作区作用域的 MCP transport pool。F3：多客户端权限仲裁。F4：协议完善和 daemon 客户端接口。
- **MCP** - Model Context Protocol。服务器暴露工具、资源和提示词；daemon ACP child 连接到它们。
- **McpTransportPool** - `packages/core/src/tools/mcp-transport-pool.ts`。F2 工作区作用域的池，按服务器名称和配置指纹共享一个 MCP transport。
- **Mediator policy** - `first-responder`、`designated`、`consensus` 或 `local-only` 之一。决定多客户端权限投票的解决方式。
- **Originator client id** - 发起当前请求权限的 prompt 的客户端的 `X-Qwen-Client-Id`。`designated` 策略仅接受来自此 id 的投票。
- **PoolEntry** - `packages/core/src/tools/mcp-pool-entry.ts`。`McpTransportPool` 中的一个条目：一个 MCP transport、附加会话的引用计数以及空闲排空计时器。
- **Session scope** - `single`（所有客户端共享一个 ACP 会话）或 `thread`（每个对话线程一个会话）。默认值为 `single`。
- **SSE** - Server-Sent Events。daemon 出站事件通道（`GET /session/:id/events`）。
- **Workspace** - daemon 启动时绑定的目录（`--workspace` 或 `cwd`）。一个 daemon 进程等于一个 workspace。

## 实现源码锚点

从文档过渡到最新的 `main` 代码时，请使用这些锚点：

| 功能模块                          | 实现锚点                                                                                                                                                                                                                                                 | 主要文档                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 引导启动与 HTTP 组装              | `packages/cli/src/serve/run-qwen-serve.ts`, `packages/cli/src/serve/server.ts`, `packages/cli/src/serve/routes/health-demo.ts`, `/demo`                                                                                                                  | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                   |
| ACP bridge 与会话多路复用         | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                   | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                          |
| 权限仲裁                          | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                     | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                    |
| MCP transport pool                | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                               | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                              |
| MCP budget 防护机制               | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                         | [`06`](./06-mcp-budget-guardrails.md)                                                                                  |
| Workspace 文件系统                | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                          | [`07`](./07-workspace-filesystem.md)                                                                                   |
| Event schema 与 SSE 写入器        | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/routes/sse-events.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId` | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| 事件重同步                        | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                             | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| Capabilities                      | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                         | [`11`](./11-capabilities-versioning.md)                                                                                |
| 认证与设备流                      | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                           | [`12`](./12-auth-security.md)                                                                                          |
| TypeScript SDK daemon 客户端      | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                             | [`13`](./13-sdk-daemon-client.md)                                                                                      |
| 共享 UI 记录层                    | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                               | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| Channels 与 IDE 适配器            | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                   |

## 明确不在范围内的内容

- **Java / Python SDK daemon 客户端** - 目前只有 TypeScript SDK 提供 daemon 客户端。文档 13 仅针对 TypeScript。
- **Web UI 产品细节** - 此处涵盖了共享记录层和 Web UI daemon 入口点，但产品 UI 布局在 `docs/developers/daemon-ui/` 和适配器设计说明中跟踪。
- **Zed 扩展（`packages/zed-extension/`）** - 它直接通过 stdio 启动 `qwen --acp`，绕过 daemon。
- **实验性进程内托管** - `--no-http-bridge` 目前仍回退到 http-bridge；稳定的进程内 serve 模式在落地时需要新文档。

## 当前 daemon 模式覆盖范围

### 服务端核心覆盖范围

| 模块                      | 当前状态                                                                                                                                                                     | 主要文档                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 引导启动 / 监听路径       | `qwen serve` 延迟加载 `runQwenServe`，验证 auth/workspace/budget/settings，构建 Express 应用，然后调用 `app.listen` 并永久阻塞直到收到信号。                                 | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)  |
| 认证 / 网络防护           | 环回地址默认无需 bearer；非环回地址需要 bearer；`--require-auth` 将 bearer 扩展到环回地址和 `/health`；主机白名单和默认 CORS 拒绝处于激活状态。                                | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)          |
| 会话生命周期              | 已记录 `POST /session`、`load`、`resume`、元数据补丁、心跳、驱逐、空闲回收、prompt 挂起限制和优雅关闭。                                                                      | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)          |
| ACP bridge                | 默认多路复用单个 ACP child；`sessionScope` 支持 `single` 和 `thread`；已接入 `BridgeFileSystem`、上下文文件名、环境变量覆盖和 channel 空闲超时。                             | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)      |
| MCP pool / budget         | 除非 `QWEN_SERVE_NO_MCP_POOL=1`，否则默认开启 Workspace MCP pool；已记录防护机制事件和重启语义。                                                                             | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md) |
| 权限                      | F3 仲裁器支持 `first-responder`、`designated`、`consensus` 和 `local-only`；无效设置会明确报错。                                                                             | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)   |

### 线协议

| 模块          | 当前状态                                                                                                                                                                                        | 主要文档                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| HTTP 路由     | 路由目录位于 `qwen-serve-protocol.md`；本 daemon 文档集仅引用它并说明实现归属。                                                                                                                 | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)           |
| Event schema  | `EVENT_SCHEMA_VERSION = 1`；47 种已知事件类型；无 ID 订阅者的合成帧；`_meta.serverTimestamp` 由 `EventBus.publish()` 打时间戳（合成帧回退使用 `formatSseFrame()`）。                              | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                   |
| Capabilities  | `SERVE_PROTOCOL_VERSION = 'v1'`；75 个已注册标签；13 个条件标签。                                                                                                                               | [`11`](./11-capabilities-versioning.md)                                                                   |
| Session shell | `POST /session/:id/shell` 接口在启用 `--enable-session-shell`、bearer 认证及会话绑定的 `X-Qwen-Client-Id` 后可用；能力标签为条件性。                                                            | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md) |
| 速率限制      | 可选的按层级 HTTP 速率限制通过 CLI 参数/环境变量和条件能力标签暴露。                                                                                                                            | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                    |
### 客户端 / SDK

| 领域                         | 当前状态                                                                                                                                                | 主要文档                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript SDK daemon 客户端 | `DaemonClient`、`DaemonSessionClient`、`DaemonAuthFlow`、SSE 解析器、事件 reducer、功能预检及 UI transcript 导出均已文档化。            | [`13`](./13-sdk-daemon-client.md)                                                                                                             |
| 共享 UI transcript 层   | SDK `daemon/ui/*` 将 daemon 事件标准化为 42 种 UI 语义事件类型，将其归约为 transcript 块，并提供渲染器/一致性辅助工具。 | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) |
| Web UI daemon 消费端       | `packages/webui/src/daemon/` 通过 React providers 和 adapters 消费 SDK transcript store。                                                         | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                 |
| CLI TUI / channels / VS Code | 旧版路径仍然存在；向共享 transcript 原语的迁移已作为后续工作记录，而非已完成的行为。                                 | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                         |

### 参考与运维

| 领域                    | 当前状态                                                                                                                                             | 主要文档                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 配置           | 完整的 `qwen serve` 标志、环境变量、`settings.json`、`ServeOptions`、`BridgeOptions` 及重要常量均汇总在一个页面中。                   | [`17`](./17-configuration.md)         |
| 快速入门 / 运维 | 涵盖最短启动路径、启动方案、curl 检查、演示页面鉴权行为、路由拆分、关闭行为以及嵌入式调用方案。 | [`20`](./20-quickstart-operations.md) |
| 错误                  | 总结了启动时的显式失败、路由错误、bridge 错误、EventBus 错误、文件系统错误和 mediator 错误，并提供了修复建议。        | [`18`](./18-error-taxonomy.md)        |
| 可观测性           | 记录了 `QWEN_SERVE_DEBUG`、curl 方案、有用事件、遥测盲区以及排查清单。                                             | [`19`](./19-observability.md)         |

### 历史或已弃用的接口

| 接口                                            | 状态                                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`    | 旧版 `DaemonTuiAdapter` 技术预研的历史草案；当前共享 UI transcript 架构见文档 14。 |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts` | 旧版实验性 adapter 仍保留在代码库中。新的共享 UI 工作应优先使用 SDK `daemon/ui/*`。                 |
| `--no-http-bridge`                                 | 为兼容起见予以接受，但会回退到 http-bridge 并在 stderr 打印提示。                                    |

### 前向兼容性

- 事件 schema v1 是增量式的。新的已知事件类型必须追加到 `DAEMON_KNOWN_EVENT_TYPE_VALUES`；旧版 SDK 必须将未知类型视为前向兼容。
- 能力标签是行为契约。新行为需要新标签，特别是当客户端可能在调用路由前对其进行预检时。
- `sessionScope: 'thread'` 是当前按对话线程拆分的范围；避免重新引入旧版的客户端范围表述。
- Envelope `_meta` 和 ACP payload `data._meta` 是不同的。工具调用来源位于 ACP payload 下；服务端发送时间戳位于 SSE envelope 上。

## 版本溯源

本文档集反映了当前已合并到 `main` 分支的 daemon 模式接口，包括 [#4412](https://github.com/QwenLM/qwen-code/pull/4412) 的后续工作。它有意描述当前行为，而非早期的 F 系列规划快照。