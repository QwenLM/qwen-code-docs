# 类型化 Daemon 事件 Schema v1

## 概述

Daemon 在 `GET /session/:id/events` 上发出的每个 SSE 帧都具有 `{ id, v, type, data, originatorClientId?, _meta? }` 的结构。`v: 1` 是当前的 `EVENT_SCHEMA_VERSION`。`type` 来自 `packages/sdk-typescript/src/daemon/events.ts` 中封闭且版本固定的 `DAEMON_KNOWN_EVENT_TYPE_VALUES` 集合。envelope 的 `_meta` 字段由 `packages/cli/src/serve/routes/sse-events.ts` 中的 `formatSseFrame()` 在 SSE 写入边界处注入；请参阅 [Envelope-level metadata](#envelope-level-metadata)。

SDK 暴露了 `asKnownDaemonEvent(evt)`。它为已知事件类型返回一个可区分的 `KnownDaemonEvent`，为其他类型返回 `undefined`。因此，当较新的 daemon 添加新事件类型时，SDK 使用者可以处理向前兼容性，而无需 SDK 同步升级；session reducer 会将这些事件记录为 `unrecognizedKnownEventCount`。

传输格式位于 [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)。本页是每个事件的 payload 契约。

## 职责

- 提供事件词汇表（`DAEMON_KNOWN_EVENT_TYPE_VALUES`）的唯一真实来源。
- 为每种事件类型提供类型化的 envelope（`DaemonEventEnvelope<TType, TData>`）。
- 提供纯 reducer（`reduceDaemonSessionEvent`, `reduceDaemonAuthEvent`），将事件流投影到 SDK 视图状态中。
- 广播 `typed_event_schema` 能力标签作为信息信号。如果缺少该标签，`asKnownDaemonEvent` 仍会回退到 `unknown`。

## 事件词汇表

按领域分组。

### 核心 session

| Type                       | Direction      | Trigger                                                                       | Key payload fields                                                               |
| -------------------------- | -------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `session_update`           | S->C           | 任何 ACP `sessionUpdate` 通知：agent 文本、思考、工具调用或计划 | `sessionUpdate: string, content?: ...`（不透明的 ACP 结构）                        |
| `session_metadata_updated` | S->C           | `PATCH /session/:id/metadata`                                                 | `sessionId, displayName?`                                                        |
| `session_died`             | S->C 终止  | `channel.exited`                                                              | `sessionId, reason, exitCode? \| null, signalCode? \| null`                      |
| `session_closed`           | S->C 终止  | `DELETE /session/:id` 或编程式关闭                                   | `sessionId, reason: 'client_close' \| string, closedBy?`                         |
| `session_snapshot`         | S->C 合成 | SSE 附加/重放后的快照帧                                      | `sessionId, currentModelId: string \| null, currentApprovalMode: string \| null, recordingDegraded: boolean` |
| `session_recording_degraded` | S->C   | 会话 transcript writer 在异步写入失败后永久停止               | `sessionId, reason: 'write_failed'`                                                                          |

### 订阅者级别的合成帧

| Type                    | Trigger                                                                                                                                                                                                                              | Notes                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client_evicted`        | 每个订阅者的 EventBus 队列溢出。**无 `id`**                                                                                                                                                                                  | `reason: 'queue_overflow' \| 'queue_bytes_overflow' \| string, droppedAfter?: number, queueSize?: number, maxQueued?: number, queuedBytes?: number, maxQueuedBytes?: number, eventBytes?: number`；仅对当前订阅者终止，而 session 保持存活。                                                  |
| `slow_client_warning`   | 实时帧积压或实时序列化字节积压 >= 75%；强制推送且**无 `id`**                                                                                                                                          | `queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?: 'frames' \| 'bytes' \| 'frames_and_bytes'`；当帧和字节测量值均降至 37.5% 以下时重新触发。                                                                                                                                   |
| `stream_error`          | `SubscriberLimitExceededError` 或其他路由流错误                                                                                                                                                                         | `error: string`；对订阅终止。                                                                                                                                                                                                                                                                                |
| `state_resync_required` | `subscribe({lastEventId})` 检测到 daemon ring 不再包含 `[lastEventId+1, earliestInRing-1]`，或者客户端游标来自上一个 bus epoch。在剩余的重放帧**之前**强制推送且**无 `id`**。 | `reason: 'ring_evicted' \| 'epoch_reset' \| string`, `lastDeliveredId: number`, `earliestAvailableId: number`。这是一个恢复信号，而非终止信号：SSE 流保持打开，重放 + 实时帧继续。SDK reducer 设置 `awaitingResync = true` 并跳过增量，直到调用者使用 `loadSession` 重置。 |
| `history_truncated`     | `POST /session/:id/load` 在较旧的内存中重放条目被丢弃后返回有界重放快照。前置于 `compactedReplay` 且**无 `id`**。                                                                                                                                  | `reason: 'replay_window_exceeded'`, `truncatedEvents: number`, `retainedEvents: number`, `maxBytes: number`, `truncatedTurns?: number`, `fullTranscriptAvailable: boolean`。这是一个状态标记，而非重同步请求；客户端渲染它并继续应用保留的重放。                                                    |
| `replay_complete`       | 在 `Last-Event-ID` 重放循环完成后发出的无 id 哨兵，适用于干净重放和 ring 驱逐路径，即使 `data.replayedCount === 0`。**无 `id`**                                                             | `replayedCount: number`；允许使用者确定性地移除追赶 UI，而无需超时。                                                                                                                                                                                                                                |

`fullTranscriptAvailable` 是一个布尔能力标志，而非字面量 `true` 类型。当前 daemon 在 `/session/:id/transcript` 可用于分页持久化 transcript 时发出 `true`；较旧或受限的 daemon 可能发出 `false`，客户端应继续正常渲染有界重放。

### 权限（F3 + base）

| Type                          | Direction | Trigger                                            | Key payload fields                                                                                                                               |
| ----------------------------- | --------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `permission_request`          | S->C      | Agent 调用 `requestPermission`                    | `requestId, sessionId, toolCall, options[]`；envelope 会注入来自 prompt 发起者的 `originatorClientId`。                                |
| `permission_resolved`         | S->C      | Mediator 已决定                               | `requestId, outcome`（ACP `PermissionOutcome`）                                                                                                   |
| `permission_already_resolved` | S->C      | 在请求已被决定后收到投票 | `requestId, sessionId, outcome`                                                                                                                  |
| `permission_partial_vote`     | S->C      | `consensus` 策略记录非最终投票        | `requestId, sessionId, votesReceived, votesNeeded (>= 1), quorum, optionTallies: Record<string, number>, originatorClientId?`                    |
| `permission_forbidden`        | S->C      | 策略拒绝投票                              | `requestId, sessionId, clientId?, reason: 'designated_mismatch' \| 'remote_not_allowed', originatorClientId?`；匿名投票者省略 `clientId`。 |

### 模型

| Type                  | Direction | Payload                                      |
| --------------------- | --------- | -------------------------------------------- |
| `model_switched`      | S->C      | `sessionId, modelId`                         |
| `model_switch_failed` | S->C      | `sessionId, requestedModelId, error: string` |

### MCP 护栏（PR 14b + F2）

| Type                         | Direction | Payload                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp_budget_warning`         | S->C      | `liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' \| 'enforce', scope?: 'workspace' \| 'session'`                                                                                                                                                                                                                                                                                                                             |
| `mcp_child_refused_batch`    | S->C      | `refusedServers: [{ name, transport, reason: 'budget_exhausted' }], budget, liveCount, reservedCount, mode: 'enforce', scope?: 'workspace' \| 'session'`                                                                                                                                                                                                                                                                                          |
| `mcp_server_restarted`       | S->C      | 用于 F2 多条目池重启的 `serverName, durationMs, entryIndex?`                                                                                                                                                                                                                                                                                                                                                                            |
| `mcp_server_restart_refused` | S->C      | `serverName, reason: 'budget_would_exceed' \| 'in_flight' \| 'disabled' \| 'restart_failed', entryIndex?, details?`。第四个值 `restart_failed` 携带了池模式多条目重启的底层硬故障。`MCP_RESTART_REFUSED_REASONS` 会拒绝未知原因；较旧的 SDK reducer 会静默丢弃新增的原因值，因为 `parseDaemonEvent` 会返回 `undefined`。请随知晓该新原因的 SDK 一起发布。 |
### 变更控制 (Wave 4 PR 16+17)

| Type                     | Direction | Payload                                                                                                                                        |
| ------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory_changed`         | S->C      | 文件内存：`scope: 'workspace' \| 'global', filePath, mode, bytesWritten`；托管内存：`scope: 'managed', source, taskId, touchedScopes` |
| `agent_changed`          | S->C      | `change: 'created' \| 'updated' \| 'deleted', name, level: 'project' \| 'user'`                                                                |
| `approval_mode_changed`  | S->C      | `sessionId, previous, next, persisted: boolean`                                                                                                |
| `tool_toggled`           | S->C      | `toolName, enabled`；影响下一次 ACP 子进程生成，不会变更已运行的会话。                                            |
| `settings_changed`       | S->C      | 工作区设置写入完成。Payload 是开放的；消费者应通过写后读（read-after-write）进行刷新。                                           |
| `settings_reloaded`      | S->C      | Daemon 工作区服务重新读取设置。Payload 是开放的。                                                                                     |
| `trust_change_requested` | S->C      | `workspaceCwd, desiredState: 'trusted' \| 'untrusted', reason?`                                                                                |
| `workspace_initialized`  | S->C      | `path, action: 'created' \| 'overwrote' \| 'noop', originatorClientId?`                                                                        |
| `github_setup_completed` | S->C      | `releaseTag, readmeUrl, secretsUrl?, workflows: [{path, status, sizeBytes?, error?}], gitignore: {path, status, added?, error?}`               |

`memory_changed` 还涵盖无会话的托管内存任务。对于这些 payload，`scope` 为 `"managed"`，`source` 为 `"workspace_memory_remember"`、`"workspace_memory_forget"` 或 `"workspace_memory_dream"` 之一，`taskId` 是排队的任务 ID，`touchedScopes` 列出已变更的托管内存作用域（`"user"` 和/或 `"project"`）。当 remember/forget/dream 任务完成但未触及托管内存时，不会发出任何事件。

### 设备授权流程 (PR 21)

这些事件以工作区为键（workspace-keyed），而非以会话为键。会话 reducer 将它们视为无操作（no-ops）；`reduceDaemonAuthEvent` 将它们投影到工作区级别的状态中。

| Type                          | Direction | Payload                                               |
| ----------------------------- | --------- | ----------------------------------------------------- |
| `auth_device_flow_started`    | S->C      | `deviceFlowId, providerId, expiresAt`                 |
| `auth_device_flow_throttled`  | S->C      | `deviceFlowId, intervalMs`                            |
| `auth_device_flow_authorized` | S->C      | `deviceFlowId, providerId, expiresAt?, accountAlias?` |
| `auth_device_flow_failed`     | S->C      | `deviceFlowId, errorKind, hint?`                      |
| `auth_device_flow_cancelled`  | S->C      | `deviceFlowId`                                        |

### MCP 运行时变更

| Type                 | Direction | Trigger                                                       | Key payload fields                                                           |
| -------------------- | --------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `mcp_server_added`   | S->C      | 运行时通过 `POST /workspace/mcp/servers` 添加服务器 | `name, transport, replaced, shadowedSettings, toolCount, originatorClientId` |
| `mcp_server_removed` | S->C      | 运行时移除服务器                                     | `name, wasShadowingSettings, originatorClientId`                             |

### 扩展生命周期

| Type                 | Direction | Trigger                                                              | Key payload fields                                                                                                                               |
| -------------------- | --------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `extensions_changed` | S->C      | 后台扩展安装/刷新工作完成或状态变更 | `refreshed, failed, status?: 'installed' \| 'enabled' \| 'disabled' \| 'updated' \| 'uninstalled' \| 'failed', source?, name?, version?, error?` |

### 轮次中消息注入

| Type                        | Direction | Trigger                                                                                         | Key payload fields                                                                                                                 |
| --------------------------- | --------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `mid_turn_message_injected` | S->C      | Web-shell 或远程客户端通过 `POST /session/:id/inject` 向正在运行的轮次中注入消息 | `sessionId, messages: string[], originatorClientId?`；消费者在去重前**必须**将 `originatorClientId` 与自身的 ID 进行比较。 |

### 轮次生命周期 / 助手推送

| Type                  | Direction | Trigger                                                                                                             | Key payload fields                                                                                                                                                                               |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prompt_cancelled`    | S->C      | 提示词通过显式的 `cancelSession` 路由**或**发起方 SSE 断开连接而被取消                        | Envelope 为取消客户端打上 `originatorClientId` 戳记。这表示“已请求取消”，而非“已确认取消”。对等订阅者借此得知提示词已结束。              |
| `turn_complete`       | S->C      | 轮次成功完成                                                                                       | `sessionId, stopReason, promptId?`。`promptId` 关联非阻塞提示词响应（`202`）。SDK 通过它将 SSE 事件与发起的提示词进行匹配。                                  |
| `turn_error`          | S->C      | 轮次失败                                                                                                       | `sessionId, message, code?, promptId?`；使用相同的 `promptId` 关联机制。                                                                                                                   |
| `session_rewound`     | S->C      | `POST /session/:id/rewind` 成功                                                                                | `sessionId, promptId, targetTurnIndex, filesChanged[], filesFailed[], originatorClientId?`                                                                                                       |
| `session_branched`    | S->C      | `POST /session/:id/branch` 从现有会话创建了一个分支                                                | `sourceSessionId, newSessionId, displayName, originatorClientId?`                                                                                                                                |
| `followup_suggestion` | S->C      | ACP 子进程在 `end_turn` 后生成了幽灵文本（ghost-text）后续建议，并通过每个会话的 SSE 转发               | `sessionId, suggestion, promptId`；线路仅传输 `getFilterReason()===null` 的建议。客户端将它们渲染为输入占位符的幽灵文本，并在下一次 `sendPrompt` 时使其失效。 |
| `user_shell_command`  | S->C      | 用户通过 `POST /session/:id/shell` 启动了 shell 命令；扇出（fanned out）到同一会话中的其他订阅者 | `sessionId, command, shellId, originatorClientId?`。目前还没有类型化的 `DaemonXxxData` 接口；`asKnownDaemonEvent` 返回 `undefined`，UI 规范化器会临时（ad hoc）解析它。            |
| `user_shell_result`   | S->C      | 上述 shell 命令的结果                                                                                   | `sessionId, shellId, exitCode, output, aborted`。与 `user_shell_command` 相同的临时解析说明。                                                                                               |

## 架构

| Concern                                | Source                                         | Notes                                                                                                              |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `EVENT_SCHEMA_VERSION = 1`             | `packages/acp-bridge/src/eventBus.ts`          | 每一帧都会发送。                                                                                               |
| `DAEMON_KNOWN_EVENT_TYPE_VALUES`       | `packages/sdk-typescript/src/daemon/events.ts` | 包含 53 种类型的封闭列表。                                                                                         |
| `DaemonEventEnvelope<TType, TData>`    | `events.ts`                                    | 泛型 Envelope。                                                                                                  |
| `DaemonKnownEventType`                 | `events.ts`                                    | `typeof DAEMON_KNOWN_EVENT_TYPE_VALUES[number]`。                                                                   |
| 每种事件的 payload 类型                | `events.ts`                                    | 大多数事件类型都有一个 `DaemonXxxData` 接口；`user_shell_*` 目前由 UI 规范化器临时解析。 |
| `asKnownDaemonEvent(evt)`              | `events.ts`                                    | 返回 `KnownDaemonEvent \| undefined`。                                                                           |
| `reduceDaemonSessionEvent(state, evt)` | `events.ts`                                    | 投影到 `DaemonSessionViewState` 中。                                                                            |
| `reduceDaemonAuthEvent(state, evt)`    | `events.ts`                                    | 投影到 `DaemonAuthState` 中。                                                                                   |
| `isWorkspaceScopedBudgetEvent(evt)`    | `events.ts`                                    | 检测 F2 `scope: 'workspace'`。                                                                                   |

### `DaemonSessionViewState`

`reduceDaemonSessionEvent` 填充此视图状态。CLI TUI 适配器、`DaemonChannelBridge` 和 VS Code IDE 消费它。关键字段：

- `alive: boolean` - 在收到终止帧（`session_died`、`session_closed`、`client_evicted`、`stream_error`）后变为 `false`。
- `currentModelId?: string` - 来自 `model_switched`。
- `displayName?: string` - 来自 `session_metadata_updated`。
- `pendingPermissions: Record<string, DaemonPermissionRequestData>` - 以 `requestId` 为键的未决请求；通过 `permission_resolved` / `permission_already_resolved` 清除。
- `lastSessionUpdate?: DaemonSessionUpdateData` - 最新的 `session_update`。
- `lastModelSwitchFailure?: DaemonModelSwitchFailedData` - 来自 `model_switch_failed`。
- `terminalEvent?` - 原始终止事件。
- `streamError?: DaemonStreamErrorData` - 最新的 `stream_error` payload。
- `unrecognizedKnownEventCount`, `lastUnrecognizedKnownEvent?` - 事件已被 `asKnownDaemonEvent` 识别，但 reducer 尚未为其提供专用状态。
- `droppedPermissionRequestCount`, `lastDroppedPermissionRequestId?` - 格式错误的权限请求无法进入未决映射。
- `unmatchedPermissionResolutionCount`, `lastUnmatchedPermissionResolutionId?` - 权限解析没有匹配的未决请求。
- `slowClientWarningCount`, `lastSlowClientWarning?` - 来自 `slow_client_warning`。
- `mcpBudgetWarningCount`, `lastMcpBudgetWarning?` - 来自 `mcp_budget_warning`。
- `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch?` - 来自 `mcp_child_refused_batch`。
- `lastWorkspaceMutation?`, `lastWorkspaceMutationType?` - 来自 `memory_changed` / `agent_changed`。
- `approvalMode?`, `approvalModeChangedCount`, `lastApprovalModeChange?` - 来自 `approval_mode_changed`。
- `toolToggleCount`, `lastToolToggle?` - 来自 `tool_toggled`。
- `workspaceInitCount`, `lastWorkspaceInit?` - 来自 `workspace_initialized`。
- `mcpRestartCount`, `lastMcpRestart?` - 来自 `mcp_server_restarted`。
- `mcpRestartRefusedCount`, `lastMcpRestartRefused?` - 来自 `mcp_server_restart_refused`。
- `settings_changed` / `settings_reloaded` - 被 `asKnownDaemonEvent` 识别；会话 reducer 不维护专用的视图状态字段，UI 通常将它们视为刷新信号。
- `permissionVoteProgress: Record<string, DaemonPermissionPartialVoteData>` - 共识投票进度。
- `forbiddenVotes: DaemonPermissionForbiddenData[]`, `forbiddenVoteCount` - 被策略拒绝的投票记录，上限为 32。
- `awaitingResync: boolean` - 由 `state_resync_required` 设置；当消费者重置视图状态时清除。
- `resyncRequiredCount`, `lastResyncRequired?` - 重新同步可观测性。
- `lastFollowupSuggestion?: DaemonFollowupSuggestionData` - Daemon 推送的最新后续建议。
- `lastTurnComplete?: DaemonTurnCompleteData` - 最新的成功轮次完成。
- `lastTurnError?: DaemonTurnErrorData` - 最新的轮次错误。
- `rewindCount`, `lastRewind?`, `lastBranch?` - 最新的回退（rewind）/ 分支（branch）事件。
### `DaemonAuthState`

每个 `providerId` 对应一个条目，由 `auth_device_flow_*` 驱动。每个 flow 暴露 `{ deviceFlowId, status, providerId, expiresAt?, lastThrottleIntervalMs?, lastError? }`。

## 流程

### 生产者侧

```mermaid
flowchart LR
    A["ACP 子进程通知"] --> B["BridgeClient.sessionUpdate /<br/>BridgeClient.extNotification"]
    B --> C{"映射到事件类型？"}
    C -->|yes| D["EventBus.publish({type, data, originatorClientId?})"]
    C -->|no| E["不发送（丢弃或记录日志）"]
    D --> F["分配 id + v=1，推入 ring"]
    F --> G["扇出到所有订阅者"]
```

### 消费者侧 (SDK)

```mermaid
flowchart LR
    A["SSE 字节流"] --> B["parseSseStream -> DaemonEvent[]"]
    B --> C["asKnownDaemonEvent(evt)"]
    C -->|"KnownDaemonEvent"| D["reduceDaemonSessionEvent(state, evt)"]
    C -->|"auth_device_flow_*"| E["reduceDaemonAuthEvent(state, evt)"]
    C -->|"undefined"| F["unrecognizedKnownEventCount++<br/>(向前兼容)"]
```

## 信封级元数据

除了每个事件的 `data` 负载外，daemon 还会注入两个信封级字段。

### `_meta.serverTimestamp` - daemon 时钟

`packages/acp-bridge/src/eventBus.ts` 中的 `EventBus.publish()` 会在事件进入 bus 时打上 `_meta.serverTimestamp` 时间戳。`BridgeEvent` 类型包含 `_meta?: Record<string, unknown>`，因此内部 daemon 消费者**确实**能在每个通过 bus 发布的事件中看到 `_meta`。`packages/cli/src/serve/routes/sse-events.ts` 中的 `formatSseFrame()` 仅为绕过 `EventBus.publish` 的合成帧（例如 `stream_error`）提供回退时间戳。

```jsonc
{
  "id": 47,
  "v": 1,
  "type": "session_update",
  "data": { ... },
  "_meta": { "serverTimestamp": 1716287345123 }
}
```

合并操作会保留输入事件中已有的 `_meta` 键（`{...input._meta, serverTimestamp: Date.now()}`）。生产者可以附加额外的信封级 `_meta` 键；`EventBus.publish` 会将它们与时间戳合并，而不是覆盖。

为什么这很重要：渲染相对时间或对 transcript 块进行排序的多客户端 UI 应该使用服务器时间，而不是每个浏览器/标签页/手机的本地时钟。服务器打时间戳可确保跨客户端的排序一致性。

SDK 访问方式：优先使用 `event._meta?.serverTimestamp`。兼容路径可能也会探测 `event.serverTimestamp` 或 `event.data._meta.serverTimestamp`。请勿将 ACP 负载的 `data._meta` 与 daemon 信封的 `_meta` 混淆。

### `originatorClientId`

由携带已注册 `X-Qwen-Client-Id` 的请求触发的事件可能会打上此字段。请参阅 [`08-session-lifecycle.md`](./08-session-lifecycle.md)。

## 工具调用 `_meta`（provenance / serverId）

这与信封 `_meta` 不同：ACP `session/update` 负载可以在 `event.data._meta` 中携带自己的 `_meta`。`ToolCallEmitter`（`packages/cli/src/acp-integration/session/emitters/tool-call-emitter.ts`）在 `emitStart`、`emitResult` 和 `emitError` 时打上两个字段：

| 字段 | 类型 | 解析规则 |
| ------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provenance` | `'builtin' \| 'mcp' \| 'subagent'` | `ToolCallEmitter.resolveToolProvenance`：`subagentMeta` 优先匹配为 `subagent`；工具名匹配 `mcp__<server>__<tool>` 的映射为 `mcp`；其他所有情况映射为 `builtin`。 |
| `serverId` | 仅当 `provenance === 'mcp'` 时为 `string` | 从 `mcp__<serverId>__<tool>` 中启发式提取。 |

现有的 `_meta.toolName` 显示名称会被保留。UI 使用这些字段来渲染 builtin / MCP server / subagent 徽章，而无需重新解析工具名称。

## SDK reducer 行为

`packages/sdk-typescript/src/daemon/events.ts` 中的 `reduceDaemonSessionEvent(state, evt)` 将流投影到 `DaemonSessionViewState`。与 resync 相关的字段包括：

- **`awaitingResync: boolean`** - 由 `state_resync_required` 设置；调用方负责清除它，通常是在 `POST /session/:id/load` 重置视图状态之后。
- **`resyncRequiredCount: number`** - 可观测性计数器。
- **`lastResyncRequired?: DaemonStateResyncRequiredData`** - 最新的负载。

当 `awaitingResync = true` 时，reducer **会跳过 delta 应用**，并且仅允许封闭的 `RESYNC_PASSTHROUGH_TYPES` 集合：

| 透传类型 | 为什么在 resync 期间仍然应用 |
| ----------------------- | ------------------------------------------------------------------------------ |
| `state_resync_required` | 罕见的第二次 resync 应该更新 `lastResyncRequired` / `resyncRequiredCount`。 |
| `session_died` | 终端流信号在 resync 期间必须保持可见。 |
| `session_closed` | 同上。 |
| `client_evicted` | 同上。 |
| `stream_error` | 同上。 |
| `session_snapshot` | 全状态权威帧；在 resync 期间应用是安全的。 |
| `session_recording_degraded` | 粘性安全信号，独立于 transcript delta 状态。 |

在 resync 期间，`lastEventId` 仍然通过 `advanceLastEventId(base)` 单调递增。在调用方重置并清除 `awaitingResync` 后，后续的 delta 将对齐到正确的游标。

`reduceDaemonAuthEvent` 在概念上将 device-flow 事件投影到工作区级别的 auth 状态条目中，其形状类似于 `{deviceFlowId, status, providerId, expiresAt?, lastThrottleIntervalMs?, lastError?}`。在代码中，reducer 将 `status`、`errorKind`、`hint`、`intervalMs`、`lastSeenEventId`、`authorizedExpiresAt` 和 `accountAlias` 存储在 `DaemonDeviceFlowReducerState` 上；daemon 事件负载本身则保持为上面列出的每个事件的形状。

## 状态与向前兼容性

- 通过追加到 `DAEMON_KNOWN_EVENT_TYPE_VALUES` 来添加已知事件类型。旧版 SDK 通过回退路径对无法识别的事件类型返回 `undefined` 并递增 `unrecognizedKnownEventCount`；新版 SDK 则依赖可辨识联合类型（discriminated union）。
- 向现有负载添加可选字段是安全的，因为负载是开放的（`{ [key: string]: unknown }`）。
- 更改现有负载的**形状**属于破坏性变更，必须提升 `EVENT_SCHEMA_VERSION`，并广播兼容的 capability 标签，例如 `caps.features.typed_event_schema_v2`。
- `id` 在每个 session 内是单调递增的。订阅者级别的合成帧（`client_evicted`、`slow_client_warning`、`stream_error`、`state_resync_required`、`replay_complete`、`session_snapshot`）故意没有 id，这样其他订阅者就不会看到间隙。
- `originatorClientId` 存在于信封上而不是 `data` 上。F3 partial-vote / forbidden 负载也会通过 `mergeOriginator` 将其合并到 `data` 中，因此视图状态消费者无需保留信封。

## 依赖项

- [`10-event-bus.md`](./10-event-bus.md) - 传输通道。
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - SDK 如何预检 `typed_event_schema`、`mcp_guardrail_events` 和 `permission_mediation`。
- [`04-permission-mediation.md`](./04-permission-mediation.md) - 如何生成 permission 事件。
- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - `asKnownDaemonEvent`、reducer 以及视图状态形状。

## 配置

- 始终广播：`typed_event_schema`、`mcp_guardrail_events` 和 `permission_mediation`（包含支持的策略模式）。
- 没有环境变量或标志直接控制 schema 本身。`QWEN_SERVE_NO_MCP_POOL=1` 会将 MCP 事件的 `scope` 从 `'workspace'` 更改为缺失或 `'session'`。

## 注意事项与已知限制

- 七种合成帧类型故意没有 `id`；SDK 代码不得假设每个事件都有 id。
- `permission_partial_vote` 仅出现在 `consensus` 下。`permission_forbidden` 出现在 `designated`、`consensus` 和 `local-only` 下，但不出现在 `first-responder` 下。
- `mcp_child_refused_batch` 仅出现在 `mode: 'enforce'` 中；`warn` 模式永远不会拒绝。
- `auth_device_flow_*` 事件不是 session 键控的。通过 `DaemonSessionClient` 消费时，请使用 `reduceDaemonAuthEvent` 处理它们，而不是使用 session reducer。

## 参考资料

- `packages/sdk-typescript/src/daemon/events.ts`
- `packages/acp-bridge/src/eventBus.ts`（`EVENT_SCHEMA_VERSION`）
- `packages/cli/src/serve/capabilities.ts`（`typed_event_schema`、`mcp_guardrail_events`、`permission_mediation`）
- 协议参考：[`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)