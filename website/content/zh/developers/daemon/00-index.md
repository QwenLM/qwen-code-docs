# 守护进程开发者文档

本文档是面向开发者的 **qwen-code守护进程模式** 技术文档：包括 `qwen serve` HTTP 守护进程、`@qwen-code/acp-bridge` 包、工作区范围的 MCP 传输池、多客户端权限协调、类型化守护进程事件模式 v1、TypeScript SDK 守护进程客户端，以及连接到守护进程的适配器。

它补充而不是替代以下现有文档：

| 现有文档                                                                           | 目标读者              | 对应的事实标准                                              |
| ---------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------- |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                           | 运维人员              | 用户快速入门、命令行标志、威胁模型                           |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                           | 协议实现者            | HTTP 路由目录、请求/响应格式、错误码                         |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md) | SDK 用户              | 端到端 TypeScript 操作指南                                   |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                         | 适配器作者            | 旧版客户端适配器设计文档                                    |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                 | 适配器作者            | 客户端适配器设计说明                                        |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)   | F2 维护者             | 工作区 MCP 传输池设计 v2.2                                  |

如果你想 **启动并使用守护进程**，请先阅读 `qwen-serve.md`。如果你想 **基于线格式构建客户端**，请阅读 `qwen-serve-protocol.md`。如果你想 **理解、扩展或调试守护进程内部机制**，请阅读本组文档。

## 阅读顺序

根据你的目标选择路径：

- **先启动并验证守护进程**：`20 -> 17 -> 19`。
- **新贡献者**：`01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`。
- **添加新的客户端适配器**：`01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`。
- **处理 MCP 池或预算**：`01 -> 03 -> 05 -> 06`。
- **处理权限**：`01 -> 03 -> 04 -> 12`。
- **调试生产环境守护进程**：`19 -> 18 -> 17 -> 20`。

## 文档集

### 基础

- [`01-architecture.md`](./01-architecture.md) - 系统架构、进程拓扑、包地图及所有七个顶层序列图。

### 服务端核心

- [`02-serve-runtime.md`](./02-serve-runtime.md) - `runQwenServe` 启动引导、Express 应用、中间件链、优雅关闭。
- [`03-acp-bridge.md`](./03-acp-bridge.md) - `@qwen-code/acp-bridge` 包内部机制、会话复用、通道工厂、ACP 子进程生成。
- [`04-permission-mediation.md`](./04-permission-mediation.md) - `MultiClientPermissionMediator`、四种策略、N1 超时不变量、取消哨兵。
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) - `McpTransportPool` (F2)、池条目、反向索引、重启、排空。
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) - `WorkspaceMcpBudget`、模式 (`off`/`warn`/`enforce`)、滞后、拒绝批次合并。
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) - `WorkspaceFileSystem` 沙箱、路径策略、审计、`BridgeFileSystem` 契约。
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) - 创建/附加/加载/恢复、`X-Qwen-Client-Id`、心跳、驱逐、元数据。
- [`09-event-schema.md`](./09-event-schema.md) - 类型化事件模式 v1：所有 43 种已知事件类型及其负载、规约函数、向前兼容。
- [`10-event-bus.md`](./10-event-bus.md) - `EventBus`、单调递增 ID、环形回放、`Last-Event-ID`、慢客户端背压、`client_evicted`。
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - 能力注册表、协议版本、模式版本、有条件声明。
- [`12-auth-security.md`](./12-auth-security.md) - Bearer 中间件、主机白名单、CORS 拒绝、变更门控、`--require-auth`、`/health` 豁免、设备流。

### 客户端

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - TypeScript SDK：`DaemonClient`、`DaemonSessionClient`、`DaemonAuthFlow`、SSE 解析器、事件规约函数、`ui/*` 转录层。
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) - 共享 UI 转录层及与旧版 CLI TUI 守护进程适配器的关系。
- [`15-channel-adapters.md`](./15-channel-adapters.md) - `DaemonChannelBridge` 共享基础及钉钉、微信 (Weixin)、Telegram、飞书各通道适配器。
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) - `DaemonIdeConnection`、仅回环强制、webview 桥接。

### 参考附录

- [`17-configuration.md`](./17-configuration.md) - 影响守护进程的环境变量、CLI 标志、`settings.json` 键。
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) - 按层划分的类型化错误及处理建议。
- [`19-observability.md`](./19-observability.md) - `QWEN_SERVE_DEBUG`、调试技巧、遥测缺口。
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) - 最短启动路径、curl 验证、路由地图及内嵌调用方案。

## 词汇表

- **ACP** - 代理客户端协议（Agent Client Protocol）。守护进程桥与 ACP 子进程之间基于 stdio 的 JSON-RPC 通信。这不是客户端用来连接守护进程的 HTTP 协议。
- **ACP child** - 守护进程生成的子进程 (`qwen --acp`)，用于承载实际的代理运行时。桥将单个 ACP 子进程复用到多个已连接的客户端。
- **acp-bridge** - `@qwen-code/acp-bridge` 包 (`packages/acp-bridge/`)。拥有会话复用、权限协调器、事件总线和通道工厂。
- **BridgeClient** - `packages/acp-bridge/src/bridgeClient.ts`。包装一个 ACP `ClientSideConnection`，处理 `requestPermission`、`sendPrompt` 和 `cancelSession`。
- **Channel factory** - 可插拔策略，用于生成或附加到 ACP 子进程。默认 `spawnChannel` 将 `qwen --acp` 作为子进程运行；`inMemoryChannel` 在测试中以进程内方式运行。
- **DaemonClient** - `packages/sdk-typescript/src/daemon/DaemonClient.ts`。TypeScript SDK 中面向守护进程的 HTTP 级外观。
- **DaemonSessionClient** - `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`。会话范围包装器，用于跟踪 `lastSeenEventId` 以实现 SSE 回放。
- **EventBus** - `packages/acp-bridge/src/eventBus.ts`。每会话内存发布/订阅，带有单调递增 ID、有界环形缓冲区和每订阅者背压。
- **F1 / F2 / F3 / F4** - 在 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) 中跟踪的内部里程碑。F1：桥提取和 `BridgeFileSystem`。F2：工作区范围的 MCP 传输池。F3：多客户端权限协调。F4：协议完备及守护进程客户端接口。
- **MCP** - 模型上下文协议（Model Context Protocol）。服务器公开工具、资源和提示；守护进程的 ACP 子进程连接它们。
- **McpTransportPool** - `packages/core/src/tools/mcp-transport-pool.ts`。F2 工作区范围池，按服务器名称和配置指纹共享一个 MCP 传输。
- **Mediator policy** - 取值为 `first-responder`、`designated`、`consensus` 或 `local-only` 之一。决定多客户端权限投票如何解决。
- **Originator client id** - 发起当前请求权限的提示的客户端的 `X-Qwen-Client-Id`。`designated` 策略仅接受此 ID 的投票。
- **PoolEntry** - `packages/core/src/tools/mcp-pool-entry.ts`。`McpTransportPool` 中的一个条目：一个 MCP 传输、已附加会话的引用计数、空闲排空计时器。
- **Session scope** - `single`（所有客户端共享一个 ACP 会话）或 `thread`（每个对话线程一个会话）。默认为 `single`。
- **SSE** - 服务器发送事件（Server-Sent Events）。守护进程的出站事件通道 (`GET /session/:id/events`)。
- **Workspace** - 守护进程启动时绑定的目录（`--workspace` 或 `cwd`）。一个守护进程进程等于一个工作区。

## 实现源码锚点

从文档定位到最新 `main` 代码时使用以下锚点：

| 接口区域                         | 实现源码锚点                                                                                                                                                                                                                                                                                    | 主要文档                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 启动引导与 HTTP 组装             | `packages/cli/src/serve/run-qwen-serve.ts`, `server.ts`, `/demo`                                                                                                                                                                                                                                | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                  |
| ACP 桥与会话复用                 | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                                                          | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                         |
| 权限协调                         | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                                                            | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                   |
| MCP 传输池                       | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                                                                      | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                             |
| MCP 预算护栏                     | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                                                                | [`06`](./06-mcp-budget-guardrails.md)                                                                                 |
| 工作区文件系统                   | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                                                                 | [`07`](./07-workspace-filesystem.md)                                                                                  |
| 事件模式与 SSE 写入器            | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/server.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId`                                       | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                               |
| 事件重新同步                     | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                                                                      | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                               |
| 能力                             | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                                                                | [`11`](./11-capabilities-versioning.md)                                                                               |
| 认证与设备流                     | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                                                                  | [`12`](./12-auth-security.md)                                                                                         |
| TypeScript SDK 守护进程客户端     | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                                                                    | [`13`](./13-sdk-daemon-client.md)                                                                                     |
| 共享 UI 转录层                   | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                                                                      | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| 通道与 IDE 适配器                | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                                                       | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                  |

## 有意排除的范围

- **Java / Python SDK 守护进程客户端** - 目前仅 TypeScript SDK 提供守护进程客户端。文档 13 仅限 TypeScript。
- **Web UI 产品细节** - 本文档涵盖共享转录层和 Web UI 守护进程入口点，但产品 UI 布局在 `docs/developers/daemon-ui/` 和适配器设计说明中跟踪。
- **Zed 扩展 (`packages/zed-extension/`)** - 它通过 stdio 直接启动 `qwen --acp`，绕过守护进程。
- **实验性的进程内托管** - `--no-http-bridge` 目前仍回退到 http-bridge；稳定的进程内服务模式上线后需要新文档。

## 当前守护进程模式覆盖情况

### 服务端核心覆盖

| 区域                       | 当前状态                                                                                                                                                                 | 主要文档                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 启动引导 / 监听路径        | `qwen serve` 懒加载 `runQwenServe`，验证 auth/工作区/预算/设置，构建 Express 应用，然后调用 `app.listen` 并阻塞直到收到信号。                                            | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)              |
| 认证 / 网络护栏            | 回环默认无 bearer；非回环需要 bearer；`--require-auth` 将 bearer 扩展到回环和 `/health`；主机白名单和默认 CORS 拒绝生效。                                                  | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)                      |
| 会话生命周期               | `POST /session`、`load`、`resume`、元数据补丁、心跳、驱逐、空闲回收、提示待处理限制及优雅关闭均已记录。                                                                 | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)                      |
| ACP 桥                     | 默认复用单个 ACP 子进程；`sessionScope` 支持 `single` 和 `thread`；`BridgeFileSystem`、上下文文件名、环境变量覆盖及通道空闲超时均已连接。                                | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)                  |
| MCP 池 / 预算              | 工作区 MCP 池默认开启，除非设置 `QWEN_SERVE_NO_MCP_POOL=1`；护栏事件和重启语义已记录。                                                                                  | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)         |
| 权限                       | F3 协调器支持 `first-responder`、`designated`、`consensus` 和 `local-only`；无效设置会明确失败。                                                                         | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)               |

### 线协议

| 区域          | 当前状态                                                                                                                                        | 主要文档                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| HTTP 路由     | 路由目录位于 `qwen-serve-protocol.md`；本守护进程文档集仅引用它并解释实现所有权。                                                               | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)       |
| 事件模式      | `EVENT_SCHEMA_VERSION = 1`；43 种已知事件类型；无 ID 订阅者合成帧；`_meta.serverTimestamp` 在 SSE 写入边界打戳。                                  | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                               |
| 能力          | `SERVE_PROTOCOL_VERSION = 'v1'`；67 个已注册标签；10 个条件标签。                                                                               | [`11`](./11-capabilities-versioning.md)                                                               |
| 会话 Shell    | `POST /session/:id/shell` 存在于 `--enable-session-shell` 之后，需要 bearer 认证和会话绑定的 `X-Qwen-Client-Id`；能力标签是条件性的。            | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md) |
| 速率限制      | 可选的按层 HTTP 速率限制通过 CLI 标志/环境变量和条件能力标签暴露。                                                                               | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                |

### 客户端 / SDK

| 区域                     | 当前状态                                                                                                                                                     | 主要文档                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript SDK 守护进程客户端 | `DaemonClient`、`DaemonSessionClient`、`DaemonAuthFlow`、SSE 解析器、事件规约函数、功能预检查及 UI 转录导出均已记录。                                       | [`13`](./13-sdk-daemon-client.md)                                                                                                                 |
| 共享 UI 转录层           | SDK `daemon/ui/*` 将守护进程事件规范化为 37 种 UI 语义事件类型，规约为转录块，并提供渲染器/一致性辅助函数。                                                   | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md)     |
| Web UI 守护进程消费者    | `packages/webui/src/daemon/` 通过 React 提供者和适配器消费 SDK 转录存储。                                                                                   | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                     |
| CLI TUI / 通道 / VS Code | 遗留路径仍然存在；迁移到共享转录原语被记录为后续工作，而非已完成行为。                                                                                       | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                             |
### 参考与操作

| 领域                      | 当前状态                                                                                                                                                             | 主要文档                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 配置                    | 完整的 `qwen serve` 标志、环境变量、`settings.json`、`ServeOptions`、`BridgeOptions` 以及重要常量均已收录在一个页面中。                                                             | [`17`](./17-configuration.md)   |
| 快速入门 / 操作           | 涵盖最短启动路径、启动方案、curl 检查、演示页面的认证行为、路由拆分、关闭行为以及嵌入式调用方案。                                                                                 | [`20`](./20-quickstart-operations.md) |
| 错误                    | 总结了启动时的显式失败、路由错误、桥接错误、EventBus 错误、文件系统错误以及中介器错误，并附有修复措施。                                                                               | [`18`](./18-error-taxonomy.md)  |
| 可观测性                 | 记录了 `QWEN_SERVE_DEBUG`、curl 方案、有用的事件、遥测空白以及调查检查清单。                                                                                                 | [`19`](./19-observability.md)    |

### 历史或已废弃的部分

| 表面                                                     | 状态                                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`         | 旧版 `DaemonTuiAdapter` 原型的历史草稿；当前共享 UI 转录架构见文档 14。                                                              |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts`     | 仍在代码库中的遗留实验性适配器。新的共享 UI 工作应优先使用 SDK 的 `daemon/ui/*`。                                                        |
| `--no-http-bridge`                                     | 为了兼容性接受，但会回退到 http-bridge 并输出 stderr。                                                                             |

### 向前兼容性

- 事件模式 v1 是可扩展的。新的已知事件类型必须追加到 `DAEMON_KNOWN_EVENT_TYPE_VALUES`；旧 SDK 必须将未知类型视为向前兼容。
- 能力标签是行为契约。新行为需要新标签，特别是当客户端可能先检查再调用路由时。
- `sessionScope: 'thread'` 是当前的按对话线程拆分方式；避免重新引入旧的客户端作用域措辞。
- 信封 `_meta` 和 ACP 负载 `data._meta` 是不同的。工具调用来源位于 ACP 负载中；服务器发送时间戳位于 SSE 信封上。

## 版本来源

本文档集反映了当前合并到 `main` 分支的后台模式表面，包括来自 [#4412](https://github.com/QwenLM/qwen-code/pull/4412) 的后续工作。它有意描述当前行为，而非早期 F 系列规划快照。