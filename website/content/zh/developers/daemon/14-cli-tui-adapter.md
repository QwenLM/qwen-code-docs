# 共享 UI Transcript 层

> **当前状态**：`packages/cli/src/ui/daemon/daemon-tui-adapter.ts` 作为遗留实验性 CLI 端适配器仍保留在 `main` 分支上。本文档描述更新的 SDK 端共享 UI transcript 层：可复用的 daemon 事件规范化与 transcript 原语，任何 UI 宿主均可消费，包括 Web、TUI、IDE 和 IM 渠道。CLI TUI、渠道和 VS Code IDE 的迁移为后续工作。

## 概述

`packages/sdk-typescript/src/daemon/ui/` 为 SDK 添加了 `ui/*` 子包。它通过可复用原语将 daemon SSE 事件流转换为可渲染的 UI transcript 块：

- **规范化**（`normalizer.ts`）：将 daemon 线路 schema 的 43 种已知事件类型（参见 [`09-event-schema.md`](./09-event-schema.md)）映射为 37 种对 UI 友好的 `DaemonUiEventType` 语义事件，如 `assistant.text.delta`、`tool.update` 和 `session.metadata.changed`。
- **状态机**（`transcript.ts`、`store.ts`）：纯 reducer 加可订阅 store，将 UI 事件映射为有序的 `DaemonTranscriptBlock[]`。
- **渲染器**（`render.ts`、`terminal.ts`、`toolPreview.ts`）：将 transcript 块渲染为 HTML、终端文本和工具预览字符串。宿主可直接使用或替换。
- **一致性测试**（`conformance.ts`）：跨宿主一致性测试，用于渠道、TUI 和 IDE 界面迁移到这些原语时保持一致。

第一个生产消费方是 **`packages/webui/src/daemon/`**（[#4328](https://github.com/QwenLM/qwen-code/pull/4328)）。其 React `DaemonSessionProvider` 和 transcript 适配器让 Web UI 可直接连接 daemon HTTP+SSE，而不仅仅渲染宿主 `postMessage` 流量。CLI TUI、渠道基础层和 VS Code IDE 可在后续复用同一层；[`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) 记录了 v2 增量迁移指南。

## 职责

- 将 43 个 daemon 线路事件规范化为稳定的 UI 词汇表（`DaemonUiEventType`），使渲染器无需检查 `rawEvent.data`。
- 以 daemon 单调递增的 SSE `eventId` 作为**主排序键**，确保不同客户端以相同顺序渲染 transcript。
- 使用纯 reducer 生成 transcript 块，并提供选择器用于查询待处理权限、当前工具、审批模式、工具进度和子 agent 子块。
- 提供基础 HTML 和终端渲染器，同时允许宿主自定义渲染。
- 暴露公共常量，如 `DAEMON_PLAN_TOOL_CALL_ID`，供计划面板使用。
- 保持线路兼容性的可加性：未知事件类型规范化为 `debug`，而非被丢弃。

## 架构

### 包结构

| 文件                                             | 导出                                                                                                                                                              | 用途                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `packages/sdk-typescript/src/daemon/ui/index.ts` | 子包入口桶                                                                                                                                                        | 公共入口点                |
| `ui/types.ts`                                    | `DaemonUiEventType`、各类型 `DaemonUiEvent*` 接口、`DaemonTranscriptBlock`、`DaemonTranscriptState`、`DaemonUiToolProvenance`、`DAEMON_PLAN_TOOL_CALL_ID` | 类型定义                  |
| `ui/normalizer.ts`                               | `normalizeDaemonEvent(evt) -> DaemonUiEvent`、`getSessionUpdatePayload(evt)`                                                                                      | 线路到 UI 的映射          |
| `ui/transcript.ts`                               | `createDaemonTranscriptState()`、`appendLocalUserTranscriptMessage()`、`reduceDaemonTranscriptEvents()`、`rebuildDaemonTranscriptBlockIndex()`、选择器             | 状态机与选择器            |
| `ui/store.ts`                                    | `createDaemonTranscriptStore(initial?)`                                                                                                                           | 可订阅的 reducer store    |
| `ui/toolPreview.ts`                              | `createDaemonToolPreview(toolEvent)`                                                                                                                              | 工具调用摘要文本          |
| `ui/render.ts`                                   | `DaemonHtmlRenderOptions`、`DaemonRenderOptions`、渲染函数                                                                                                        | HTML 与通用渲染           |
| `ui/terminal.ts`                                 | 终端专用渲染                                                                                                                                                      | TUI 渲染准备              |
| `ui/conformance.ts`                              | 跨宿主一致性测试套件                                                                                                                                              | 迁移一致性测试            |
| `ui/utils.ts`                                    | 辅助工具，如 `DaemonUiContentPart`                                                                                                                                | 内部共享工具函数          |

### `DaemonUiEventType` 词汇表

`ui/types.ts` 定义了 37 种 UI 事件类型，按领域分组。

**聊天流（阶段 1）**

- `user.text.delta`、`user.image.delta`、`user.shell.command`、`assistant.text.delta`、`assistant.done`、`thought.text.delta`
- `tool.update`、`shell.output`、`user.shell.output`
- `permission.request`、`permission.resolved`
- `model.changed`、`status`、`error`、`debug`

**会话元数据**

- `session.metadata.changed`、`session.approval_mode.changed`
- `session.available_commands`、`session.state_resync_required`、`session.replay_complete`

**提示生命周期（跨客户端）**

- `prompt.cancelled`、`followup.suggestion`

**工作空间（Wave 3-4）**

- `workspace.memory.changed`、`workspace.agent.changed`
- `workspace.tool.toggled`、`workspace.settings.changed`、`workspace.initialized`
- `workspace.mcp.budget_warning`、`workspace.mcp.child_refused`
- `workspace.mcp.server_restarted`、`workspace.mcp.server_restart_refused`

**认证流程（Wave 4 OAuth）**

- `auth.device_flow.started`、`auth.device_flow.throttled`、`auth.device_flow.authorized`
- `auth.device_flow.failed`、`auth.device_flow.cancelled`

`normalizeDaemonEvent` 将 43 个 daemon 已知线路事件映射到此词汇表。未知、未建模或格式错误的事件类型规范化为 `debug`，并保留 `rawEvent` 供宿主诊断使用。

### Reducer 与选择器

```ts
// 创建初始状态。
const state = createDaemonTranscriptState();

// 应用 SSE 事件序列。
const next = reduceDaemonTranscriptEvents(state, daemonUiEvents);

// 选择器。
selectTranscriptBlocks(state); // 所有块
selectTranscriptBlocksOrderedByEventId(state); // 按 eventId 排序；推荐使用
selectPendingPermissionBlocks(state);
selectCurrentTool(state);
selectApprovalMode(state);
selectToolProgress(state, toolCallId);
selectSubagentChildBlocks(state, parentBlockId);
isSubagentChildBlock(block);
formatBlockTimestamp(block);
formatMissedRange(state); // state_resync_required 后的"你错过了 X"文本
```

### Store

`createDaemonTranscriptStore()` 提供订阅和 dispatch 功能：

```ts
const store = createDaemonTranscriptStore();
store.subscribe(() => render(store.getState()));
store.dispatch(uiEvents); // 内部运行 reducer
```

Web UI 的 `DaemonSessionProvider` 基于此 store 构建 React context。

## 流程

### 单个 SSE 事件端到端

```mermaid
flowchart LR
    A["daemon SSE 线路帧<br/>type=session_update / permission_request / ..."]
    A --> B["DaemonClient.subscribeEvents<br/>parseSseStream"]
    B --> C["asKnownDaemonEvent<br/>(09-event-schema.md)"]
    C --> D["normalizeDaemonEvent<br/>ui/normalizer.ts"]
    D --> E["DaemonUiEvent<br/>（37 种 UI 友好类型）"]
    E --> F["reduceDaemonTranscriptEvents<br/>ui/transcript.ts"]
    F --> G["DaemonTranscriptState +<br/>DaemonTranscriptBlock[]"]
    G --> H["渲染器<br/>（render.ts HTML / terminal.ts / 宿主自定义）"]
    G --> I["选择器<br/>selectCurrentTool / selectApprovalMode / ..."]
```

宿主可以在 `(E)` 处停止并实现自己的 reducer，也可以消费 `(G)` 和提供的选择器。Web UI 使用完整的 `(B) -> (H)` 路径。已迁移的 TUI 可消费 `(G)` 并使用 Ink 特定组件渲染。

### `state_resync_required`

`session.state_resync_required` 映射为 transcript 中的"错过范围"标记。UI 代码可调用 `formatMissedRange(state)` 渲染如"错过事件 X-Y"的文本。reducer **会继续应用后续事件**，但将受影响的块标记为 `resyncRecovery: true`，以便渲染器添加视觉提示。环形缓冲区驱逐和 `state_resync_required` 语义详见 [`10-event-bus.md`](./10-event-bus.md)。

## 消费方

### `packages/webui/src/daemon/`

已在 [#4328](https://github.com/QwenLM/qwen-code/pull/4328) 中落地。

| 文件                        | 导出                                                                                                                                                                                                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DaemonSessionProvider.tsx` | React `<DaemonSessionProvider />`；`useDaemonSession()`、`useDaemonTranscriptStore()`、`useDaemonTranscriptState()`、`useDaemonTranscriptBlocks()`、`useDaemonPendingPermissions()`、`useDaemonActions()`、`useDaemonConnection()` hooks；`DaemonConnectionStatus`、`DaemonConnectionState`、`DaemonSessionContextValue` 类型 |
| `transcriptAdapter.ts`      | 将 SDK `DaemonTranscriptBlock` 适配为 Web UI 的 `UnifiedMessage`，包括 markdown 流式 chunk 合并和工具调用摘要                                                                                                                                                                                                                    |
| `index.ts`                  | 子包入口桶                                                                                                                                                                                                                                                                                                                        |

Web UI 现在可以直接连接 daemon HTTP+SSE 并渲染 transcript。旧的 `ACPAdapter` 宿主 `postMessage` 路径仍然可用。

### 后续迁移

[`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) 提供了 Web 聊天和 Web 终端适配器的 v2 增量指南。其中明确指出 **CLI TUI、渠道基础层和 VS Code IDE 未在该 PR 中迁移**；每项将在后续 PR 中迁移，并使用一致性测试套件保持渲染一致性。

## 与遗留 `daemon-tui-adapter.ts` 的关系

| 维度              | 遗留 CLI `DaemonTuiAdapter`                                     | 新共享 transcript 层                                           |
| ----------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| 包                | `packages/cli/src/ui/daemon/`                                   | `packages/sdk-typescript/src/daemon/ui/`                       |
| 公共接口          | `DaemonTuiAdapter`、`DaemonTuiUpdate`、`DaemonTuiSessionClient` | `DaemonUiEventType`、`reduceDaemonTranscriptEvents`、选择器    |
| 适用范围          | 仅限 CLI Ink TUI                                                | Web、TUI、IDE 或 IM UI                                         |
| 状态形态          | TUI 本地更新联合类型                                            | 纯 transcript 块列表加状态字段                                 |
| 排序              | `createdAt`                                                     | `eventId`（daemon 单调递增，跨客户端一致）                     |
| 未知线路类型      | 在 `reduceDaemonEventToTuiUpdates` 中被丢弃                     | 规范化为 `debug` 并保留                                        |
| 测试              | 单包单元测试                                                    | 全局一致性测试套件，用于跨宿主一致性                           |

## 依赖关系

- 上游线路类型：`packages/sdk-typescript/src/daemon/events.ts`（参见 [`09-event-schema.md`](./09-event-schema.md)）。
- 实际下游消费方：`packages/webui/src/daemon/`。
- 后续迁移目标：`packages/cli/src/ui/`、`packages/channels/base/` 和 `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`。
- 并行参考文档：[`../daemon-ui/README.md`](../daemon-ui/README.md)、[`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) 和 [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)。

## 配置

- 无运行时配置。Reducer 和选择器均为纯函数。
- 宿主可选择渲染器：HTML（`render.ts`）、终端（`terminal.ts`）或自定义渲染。
- 调试时，`render.ts` 支持 `includeRawEvent: true`，可在渲染输出中包含原始线路帧。

## 注意事项与已知限制

- **`daemon-tui-adapter.ts` 仍然存在**。它是 CLI 包的遗留实验性适配器。新代码应优先使用 SDK `ui/*`：`normalizeDaemonEvent`、`reduceDaemonTranscriptEvents` 和 `DaemonTranscriptBlock`。
- **CLI TUI、渠道基础层和 VS Code IDE 尚未迁移**。它们仍维护各自的渲染逻辑。`docs/developers/daemon-client-adapters/` 目录仍有 `ide.md`、`channel-web.md` 和历史 `tui.md` 草稿；较新的 `web-ui.md` 涵盖 Web UI 适配器设计。
- **`eventId` 是主排序键**。`createdAt` 保留为已废弃的别名（`clientReceivedAt`）。新代码应使用 `selectTranscriptBlocksOrderedByEventId(state)`。`MIGRATION.md` 展示了从 `createdAt` 排序切换到 `eventId` 排序的代码差异。
- **未知线路类型规范化为 `debug`**。它们不再像旧适配器那样被丢弃。渲染器默认不显示 `debug`；宿主必须主动选择显示它。
- **Bundle 体积**：`ui/*` 子包通过 `@qwen-code/sdk/daemon` 作为 ESM 子路径导出，不引入 React 或 DOM 依赖。只有当 Web UI 消费方使用 `DaemonSessionProvider` 时，React 集成才会被加载。

## 参考资料

- `packages/sdk-typescript/src/daemon/ui/types.ts`（`DaemonUiEventType` 词汇表）
- `packages/sdk-typescript/src/daemon/ui/transcript.ts`（reducer 与选择器）
- `packages/sdk-typescript/src/daemon/ui/normalizer.ts`（线路到 UI 的映射）
- `packages/sdk-typescript/src/daemon/ui/store.ts`、`render.ts`、`terminal.ts`、`toolPreview.ts`、`conformance.ts`
- `packages/sdk-typescript/src/daemon/index.ts`（`ui/*` 重导出块）
- `packages/webui/src/daemon/DaemonSessionProvider.tsx`、`transcriptAdapter.ts`
- 上游文档：[`../daemon-ui/README.md`](../daemon-ui/README.md)、[`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md)、[`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)
- 相关 PR：[#4328](https://github.com/QwenLM/qwen-code/pull/4328)（v1 transcript 层与 Web UI provider）、[#4353](https://github.com/QwenLM/qwen-code/pull/4353)（v2 统一完整性后续）
