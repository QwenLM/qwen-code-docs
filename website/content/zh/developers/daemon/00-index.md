# Daemon 开发者文档

本文档面向开发者，涵盖 **qwen-code daemon 模式**的技术细节：`qwen serve` HTTP daemon、`@qwen-code/acp-bridge` 包、工作区范围的 MCP transport pool、多客户端权限调解、类型化 daemon 事件 schema v1、TypeScript SDK daemon 客户端，以及连接到 daemon 的各类适配器。

本文档与以下现有文档互为补充，而非替代：

| 现有文档                                                                             | 目标读者          | 权威内容                                      |
| ------------------------------------------------------------------------------------ | ----------------- | --------------------------------------------- |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                             | 运维人员          | 用户快速入门、命令行参数、威胁模型            |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                             | 协议实现者        | HTTP 路由目录、请求/响应结构、错误码          |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md) | SDK 用户          | TypeScript 端到端使用示例                     |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                           | 适配器开发者      | 历史客户端适配器设计文档                      |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                   | 适配器开发者      | 客户端适配器设计说明                          |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)     | F2 维护者         | 工作区 MCP transport pool 设计 v2.2           |

如果你想**启动并使用 daemon**，请先阅读 `qwen-serve.md`。如果你想**基于 wire 格式构建客户端**，请阅读 `qwen-serve-protocol.md`。如果你想**理解、扩展或调试 daemon 内部实现**，请阅读本文档集。

## 阅读顺序

根据目标选择对应路径：

- **先启动并验证 daemon**：`20 -> 17 -> 19`。
- **新贡献者**：`01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`。
- **添加新客户端适配器**：`01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`。
- **开发 MCP pool 或预算功能**：`01 -> 03 -> 05 -> 06`。
- **开发权限功能**：`01 -> 03 -> 04 -> 12`。
- **调试生产环境 daemon**：`19 -> 18 -> 17 -> 20`。

## 文档集

### 基础

- [`01-architecture.md`](./01-architecture.md) - 系统架构、进程拓扑、包结构图，以及七个顶层序列图。

### 服务器核心

- [`02-serve-runtime.md`](./02-serve-runtime.md) - `runQwenServe` 启动流程、Express 应用、中间件链、优雅关闭。
- [`03-acp-bridge.md`](./03-acp-bridge.md) - `@qwen-code/acp-bridge` 包内部实现、session 多路复用、channel 工厂、ACP 子进程 spawn。
- [`04-permission-mediation.md`](./04-permission-mediation.md) - `MultiClientPermissionMediator`、四种策略、N1 超时不变量、取消哨兵。
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) - `McpTransportPool`（F2）、pool 条目、反向索引、重启、drain。
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) - `WorkspaceMcpBudget`、模式（`off`/`warn`/`enforce`）、迟滞处理、拒绝批次合并。
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) - `WorkspaceFileSystem` 沙箱、路径策略、审计、`BridgeFileSystem` 契约。
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) - 创建/附加/加载/恢复、`X-Qwen-Client-Id`、心跳、驱逐、元数据。
- [`09-event-schema.md`](./09-event-schema.md) - 类型化事件 schema v1：43 种已知事件类型及其 payload、reducer、向前兼容性。
- [`10-event-bus.md`](./10-event-bus.md) - `EventBus`、单调递增 ID、环形缓冲回放、`Last-Event-ID`、慢客户端背压、`client_evicted`。
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - capability 注册表、协议版本、schema 版本、条件广播。
- [`12-auth-security.md`](./12-auth-security.md) - bearer 中间件、host 白名单、CORS 拒绝、mutation 门控、`--require-auth`、`/health` 豁免、设备授权流。

### 客户端

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - TypeScript SDK：`DaemonClient`、`DaemonSessionClient`、`DaemonAuthFlow`、SSE 解析器、事件 reducer、`ui/*` transcript 层。
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) - 共享 UI transcript 层与历史 CLI TUI daemon 适配器的关系。
- [`15-channel-adapters.md`](./15-channel-adapters.md) - `DaemonChannelBridge` 共享基类，以及钉钉、微信（Weixin）、Telegram、飞书各渠道适配器。
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) - `DaemonIdeConnection`、仅回环地址限制、webview 桥接。

### 参考附录

- [`17-configuration.md`](./17-configuration.md) - 影响 daemon 的环境变量、CLI 参数、`settings.json` 配置项。
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) - 各层类型化错误及修复建议。
- [`19-observability.md`](./19-observability.md) - `QWEN_SERVE_DEBUG`、调试方法、遥测盲区。
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) - 最短启动路径、curl 检查、路由映射、内嵌调用示例。

## 术语表

- **ACP** - Agent Client Protocol。daemon bridge 与 ACP 子进程之间通过 stdio 传输的 JSON-RPC 协议。这不是客户端与 daemon 通信所用的 HTTP 协议。
- **ACP child** - daemon 启动的子进程（`qwen --acp`），用于托管实际的 agent 运行时。bridge 将一个 ACP child 多路复用给多个已连接的客户端。
- **acp-bridge** - `@qwen-code/acp-bridge` 包（`packages/acp-bridge/`）。负责 session 多路复用、权限调解器、事件总线和 channel 工厂。
- **BridgeClient** - `packages/acp-bridge/src/bridgeClient.ts`。封装一个 ACP `ClientSideConnection`，处理 `requestPermission`、`sendPrompt` 和 `cancelSession`。
- **Channel factory** - 用于 spawn 或附加到 ACP child 的可插拔策略。默认的 `spawnChannel` 以子进程方式运行 `qwen --acp`；`inMemoryChannel` 用于测试时在进程内运行。
- **DaemonClient** - `packages/sdk-typescript/src/daemon/DaemonClient.ts`。TypeScript SDK 中封装 daemon HTTP 接口的门面类。
- **DaemonSessionClient** - `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`。Session 级别的封装，追踪 `lastSeenEventId` 以支持 SSE 回放。
- **EventBus** - `packages/acp-bridge/src/eventBus.ts`。每个 session 独立的内存 pub/sub，具有单调递增 ID、有界环形缓冲区和每订阅者背压控制。
- **F1 / F2 / F3 / F4** - 内部里程碑，追踪于 [#4175](https://github.com/QwenLM/qwen-code/issues/4175)。F1：bridge 提取与 `BridgeFileSystem`。F2：工作区范围的 MCP transport pool。F3：多客户端权限调解。F4：协议完善与 daemon 客户端接口。
- **MCP** - Model Context Protocol。服务器暴露 tools、resources 和 prompts；daemon ACP child 与之连接。
- **McpTransportPool** - `packages/core/src/tools/mcp-transport-pool.ts`。F2 工作区范围的 pool，按服务器名称和配置指纹共享一个 MCP transport。
- **Mediator policy** - `first-responder`、`designated`、`consensus` 或 `local-only` 之一，决定多客户端权限投票的解析方式。
- **Originator client id** - 发起当前请求权限的 prompt 所属客户端的 `X-Qwen-Client-Id`。`designated` 策略只接受该 id 的投票。
- **PoolEntry** - `packages/core/src/tools/mcp-pool-entry.ts`。`McpTransportPool` 中的一个条目：一个 MCP transport、已附加 session 的引用计数，以及空闲 drain 计时器。
- **Session scope** - `single`（所有客户端共享一个 ACP session）或 `thread`（每个对话线程独立一个 session）。默认值为 `single`。
- **SSE** - Server-Sent Events。daemon 出站事件通道（`GET /session/:id/events`）。
- **Workspace** - daemon 启动时绑定的目录（`--workspace` 或 `cwd`）。一个 daemon 进程对应一个 workspace。

## 实现源码锚点

从文档跳转到最新 `main` 分支代码时，可使用以下锚点：

| 功能面                         | 实现锚点                                                                                                                                                                                                                                                    | 主要文档                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 启动与 HTTP 组装               | `packages/cli/src/serve/run-qwen-serve.ts`, `server.ts`, `/demo`                                                                                                                                                                                          | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                   |
| ACP bridge 与 session 多路复用 | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                    | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                          |
| 权限调解                       | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                      | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                    |
| MCP transport pool             | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                                | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                              |
| MCP 预算护栏                   | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                          | [`06`](./06-mcp-budget-guardrails.md)                                                                                  |
| 工作区文件系统                 | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                           | [`07`](./07-workspace-filesystem.md)                                                                                   |
| 事件 schema 与 SSE writer      | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/server.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId` | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| 事件重新同步                   | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                                | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| Capabilities                   | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                          | [`11`](./11-capabilities-versioning.md)                                                                                |
| 鉴权与设备授权流               | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                            | [`12`](./12-auth-security.md)                                                                                          |
| TypeScript SDK daemon 客户端   | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                              | [`13`](./13-sdk-daemon-client.md)                                                                                      |
| 共享 UI transcript 层          | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                                | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| Channels 与 IDE 适配器         | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                 | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                   |

## 明确不在范围内的内容

- **Java / Python SDK daemon 客户端** - 目前只有 TypeScript SDK 提供 daemon 客户端。文档 13 仅涵盖 TypeScript。
- **Web UI 产品细节** - 共享 transcript 层和 Web UI daemon 入口点在此处有所涉及，但产品 UI 布局由 `docs/developers/daemon-ui/` 和适配器设计说明跟踪。
- **Zed 扩展（`packages/zed-extension/`）** - 它通过 stdio 直接启动 `qwen --acp`，绕过 daemon。
- **实验性进程内托管** - `--no-http-bridge` 目前仍回退到 http-bridge；稳定的进程内 serve 模式在落地后需要新增文档。

## 当前 daemon 模式覆盖情况

### 服务器核心覆盖情况

| 功能区域              | 当前状态                                                                                                                                                        | 主要文档                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 启动 / 监听路径       | `qwen serve` 懒加载 `runQwenServe`，验证 auth/workspace/budget/settings，构建 Express 应用，调用 `app.listen` 并持续阻塞直到收到信号。                          | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)      |
| 鉴权 / 网络护栏       | 回环地址默认无需 bearer；非回环地址需要 bearer；`--require-auth` 将 bearer 要求扩展至回环地址和 `/health`；host 白名单和默认 CORS 拒绝已启用。                  | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)              |
| Session 生命周期      | `POST /session`、load、resume、元数据补丁、心跳、驱逐、空闲回收、待处理 prompt 限制以及优雅关闭均已记录。                                                      | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)              |
| ACP bridge            | 默认单 ACP child 多路复用；`sessionScope` 支持 `single` 和 `thread`；`BridgeFileSystem`、context 文件名、环境变量覆盖和 channel 空闲超时均已接入。             | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)          |
| MCP pool / 预算       | 工作区 MCP pool 默认开启，除非设置 `QWEN_SERVE_NO_MCP_POOL=1`；护栏事件和重启语义已记录。                                                                     | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md) |
| 权限                  | F3 调解器支持 `first-responder`、`designated`、`consensus` 和 `local-only`；无效配置会明确报错。                                                               | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)       |

### Wire 协议

| 功能区域      | 当前状态                                                                                                                                       | 主要文档                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| HTTP 路由     | 路由目录位于 `qwen-serve-protocol.md`；本 daemon 文档集仅引用它并说明实现归属。                                                               | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)               |
| 事件 schema   | `EVENT_SCHEMA_VERSION = 1`；43 种已知事件类型；无 id 订阅者合成帧；`_meta.serverTimestamp` 在 SSE 写入边界打时间戳。                           | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                       |
| Capabilities  | `SERVE_PROTOCOL_VERSION = 'v1'`；67 个已注册标签；10 个条件标签。                                                                             | [`11`](./11-capabilities-versioning.md)                                                                       |
| Session shell | `POST /session/:id/shell` 需要 `--enable-session-shell`、bearer 鉴权和 session 绑定的 `X-Qwen-Client-Id`；capability 标签为条件性广播。        | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md) |
| 速率限制      | 可选的按层级 HTTP 速率限制通过 CLI 参数/环境变量暴露，并有条件性 capability 标签。                                                            | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                        |

### 客户端 / SDK

| 功能区域                     | 当前状态                                                                                                                                                     | 主要文档                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript SDK daemon 客户端 | `DaemonClient`、`DaemonSessionClient`、`DaemonAuthFlow`、SSE 解析器、事件 reducer、feature preflight 和 UI transcript 导出均已记录。                        | [`13`](./13-sdk-daemon-client.md)                                                                                                             |
| 共享 UI transcript 层        | SDK `daemon/ui/*` 将 daemon 事件规范化为 37 种 UI 语义事件类型，归约为 transcript block，并提供渲染器/一致性辅助工具。                                      | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) |
| Web UI daemon 消费者         | `packages/webui/src/daemon/` 通过 React providers 和适配器消费 SDK transcript store。                                                                       | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                 |
| CLI TUI / channels / VS Code | 历史路径仍然存在；迁移到共享 transcript 原语已记录为后续工作，尚未完成。                                                                                    | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                         |

### 参考与运维

| 功能区域      | 当前状态                                                                                                                                           | 主要文档                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 配置          | `qwen serve` 完整参数、环境变量、`settings.json`、`ServeOptions`、`BridgeOptions` 以及重要常量汇总于一页。                                         | [`17`](./17-configuration.md)         |
| 快速入门/运维 | 最短启动路径、启动示例、curl 检查、demo 页面鉴权行为、路由分割、关闭行为和内嵌调用示例均已覆盖。                                                   | [`20`](./20-quickstart-operations.md) |
| 错误          | 启动时显式失败、路由错误、bridge 错误、EventBus 错误、文件系统错误和调解器错误均已汇总并提供修复建议。                                             | [`18`](./18-error-taxonomy.md)        |
| 可观测性      | `QWEN_SERVE_DEBUG`、curl 命令、有用事件、遥测盲区和排查清单均已记录。                                                                             | [`19`](./19-observability.md)         |

### 历史或已废弃的功能面

| 功能面                                             | 状态                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`    | 旧 `DaemonTuiAdapter` 探索阶段的历史草稿；当前共享 UI transcript 架构见文档 14。              |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts` | 历史实验性适配器仍在代码库中。新的共享 UI 工作应优先使用 SDK `daemon/ui/*`。                  |
| `--no-http-bridge`                                 | 为兼容性保留，但会回退到 http-bridge 并向 stderr 输出提示。                                   |

### 向前兼容性

- 事件 schema v1 是追加式的。新的已知事件类型必须追加到 `DAEMON_KNOWN_EVENT_TYPE_VALUES`；旧版 SDK 必须将未知类型视为向前兼容。
- Capability 标签是行为契约。新行为需要新标签，尤其是当客户端可能在调用路由前进行 preflight 检查时。
- `sessionScope: 'thread'` 是当前的每对话线程拆分方式；避免重新引入旧的客户端范围表述。
- Envelope `_meta` 与 ACP payload `data._meta` 是不同的。tool-call 来源信息位于 ACP payload 下；服务器 emit 时间戳位于 SSE envelope 上。

## 版本来源

本文档集反映当前已合并到 `main` 的 daemon 模式功能面，包含来自 [#4412](https://github.com/QwenLM/qwen-code/pull/4412) 的后续工作。本文档有意描述当前行为，而非早期 F 系列规划快照。
