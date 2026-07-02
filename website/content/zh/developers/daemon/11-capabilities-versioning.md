# 能力与协议版本控制

## 概述

`GET /capabilities` 是 daemon 的预检端点。每个 SDK 客户端在调用任何其他路由之前都应读取它，以便了解 daemon 使用的协议版本、启用了哪些 feature tag，以及 daemon 绑定到了哪个 workspace。契约如下：

- **只有一个协议版本：`v1`。** `SERVE_PROTOCOL_VERSION = 'v1'` 且 `SUPPORTED_SERVE_PROTOCOL_VERSIONS = ['v1']`。v1 在内部是增量添加的；破坏性的 frame-shape 更改保留给 v2。
- **每个 tag 都有一个 `since` 版本。** 未来的 v2 daemon 可以同时广播 v1 和 v2 tag。
- **部分 tag 是有条件的。** 有十三个 tag（`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `workspace_voice`, `workspace_voice_transcription`, `session_shell_command`, `rate_limit`, `workspace_reload`, `voice_transcribe`）仅在启用相应的部署开关时才会被广播。tag 的存在意味着该行为存在。
- **Capability tag = 行为契约。** 在现有 tag 下添加新行为可能会悄悄破坏预检了旧 tag 的客户端。新行为需要新 tag。

完整的注册表位于 `packages/cli/src/serve/capabilities.ts`。

## 职责

- 声明 daemon 可能广播的每个 feature。
- 根据协议版本和部署开关过滤广播的 features。
- 暴露 `getRegisteredServeFeatures()`（所有 key，未过滤）、`getAdvertisedServeFeatures(version, toggles)`（已过滤）和 `getServeProtocolVersions()`（envelope `{ current, supported }`）。
- 保持“tag 存在意味着行为存在”的不变量。`server.test.ts` 包含一个测试，确保每个 conditional tag 在其开关打开时都会广播；添加没有 predicate 的 conditional tag 会导致该测试失败。

## 架构

### Capability envelope

`/capabilities` 返回：

```ts
{
  v: 1,                    // CAPABILITIES_SCHEMA_VERSION
  mode: 'http-bridge',
  features: ServeFeature[],
  workspaceCwd: string,
  protocol?: { current: 'v1', supported: ['v1'] },
  policy?: { permission: PermissionPolicy },
}
```

`workspaceCwd` 是在 daemon 启动时绑定的规范 workspace（参见 [`02-serve-runtime.md`](./02-serve-runtime.md)）。`policy.permission` 是活动的 mediator policy。

### `ServeCapabilityDescriptor`

```ts
interface ServeCapabilityDescriptor {
  since: ServeProtocolVersion; // current = 'v1'
  modes?: readonly string[]; // lists operation modes when a feature has modes
}
```

有四个 v1 tag 使用了 `modes`：

- `mcp_guardrails: { since: 'v1', modes: ['warn', 'enforce'] }` - 客户端在依赖拒绝行为之前应预检 `'enforce'`。
- `permission_mediation: { since: 'v1', modes: ['first-responder', 'designated', 'consensus', 'local-only'] }` - 这是构建时支持的集合；活动的 policy 在 `policy.permission` 中。
- `workspace_voice_transcription: { since: 'v1', modes: ['batch'] }` - daemon 提供的转录路径。
- `voice_transcribe: { since: 'v1', modes: ['streaming', 'batch'] }` - `/voice/stream` WebSocket 上可用的两种转录路径。

### Conditional tags

```ts
export const CONDITIONAL_SERVE_FEATURES: ReadonlyMap<
  ServeFeature,
  (toggles: AdvertiseFeatureToggles) => boolean
> = new Map([
  ['require_auth', (t) => t.requireAuth === true],
  ['mcp_workspace_pool', (t) => t.mcpPoolActive === true],
  ['mcp_pool_restart', (t) => t.mcpPoolActive === true],
  ['allow_origin', (t) => t.allowOriginActive === true],
  [
    'prompt_absolute_deadline',
    (t) => typeof t.promptDeadlineMs === 'number' && t.promptDeadlineMs > 0,
  ],
  [
    'writer_idle_timeout',
    (t) =>
      typeof t.writerIdleTimeoutMs === 'number' && t.writerIdleTimeoutMs > 0,
  ],
  ['workspace_settings', (t) => t.persistSettingAvailable === true],
  ['workspace_voice', (t) => t.persistSettingAvailable === true],
  [
    'workspace_voice_transcription',
    (t) => t.voiceTranscriptionAvailable === true,
  ],
  ['session_shell_command', (t) => t.sessionShellCommandEnabled === true],
  ['rate_limit', (t) => t.rateLimit === true],
  ['workspace_reload', (t) => t.reloadAvailable === true],
  ['voice_transcribe', (t) => t.voiceWsAvailable !== false],
]);
```

`Map` 将成员资格和 predicate 存储在一起。添加新的 conditional tag 需要两个协同更改：

1. 在 `SERVE_CAPABILITY_REGISTRY` 中注册该 tag 及其 `since` 版本。
2. 将其 predicate 添加到 `CONDITIONAL_SERVE_FEATURES`。

Baseline tags 不存在于 `Map` 中，并且是无条件广播的。这是故意通过缺失来表示的，而不是通过单独的 Set。

### 75 个 tags（v1，按领域分组）

基础（Foundation）：`health`, `daemon_status`, `capabilities`。

会话（Sessions）：`session_create`, `session_scope_override`, `session_load`, `session_resume`, `unstable_session_resume`, `session_list`, `session_prompt`, `session_cancel`, `session_events`, `session_set_model`, `session_close`, `session_metadata`, `session_archive`, `session_context`, `session_context_usage`, `session_supported_commands`, `session_tasks`, `session_stats`, `session_lsp`, `session_status`, `session_approval_mode_control`, `session_recap`, `session_btw`, **`session_shell_command`** (conditional), `session_language`, `session_rewind`, `session_hooks`, `session_branch`。

流式传输（Streaming）：`slow_client_warning`, `typed_event_schema`。

身份与心跳（Identity and heartbeat）：`client_identity`, `client_heartbeat`。

权限（Permissions）：`session_permission_vote`, `permission_vote`, **`permission_mediation`** (`modes: ['first-responder', 'designated', 'consensus', 'local-only']`)。

Workspace 只读快照（Workspace read-only snapshots）：`workspace_mcp`, `workspace_skills`, `workspace_providers`, `workspace_env`, `workspace_preflight`, `workspace_hooks`, `workspace_extensions`。

Workspace 变更（Wave 4+）：`workspace_memory`, `workspace_agents`, `workspace_agent_generate`, `workspace_tool_toggle`, **`workspace_settings`** (conditional), `workspace_permissions`, `workspace_init`, `workspace_github_setup`, `workspace_trust`, `workspace_mcp_restart`, `workspace_mcp_manage`, `workspace_file_read`, `workspace_file_bytes`, `workspace_file_write`, **`workspace_reload`** (conditional)。

MCP 防护栏（MCP guardrails）：**`mcp_guardrails`** (`modes: ['warn', 'enforce']`), `mcp_guardrail_events`, `mcp_server_runtime_mutation`, **`mcp_workspace_pool`** (conditional), **`mcp_pool_restart`** (conditional)。

Prompt 控制（Prompt control）：**`prompt_absolute_deadline`** (conditional), **`writer_idle_timeout`** (conditional), `non_blocking_prompt`。

认证（Auth）：`auth_provider_install`, `auth_device_flow`, **`require_auth`** (conditional), **`allow_origin`** (conditional)。

语音（Voice）：**`workspace_voice`** (conditional), **`workspace_voice_transcription`** (conditional, `modes: ['batch']`), **`voice_transcribe`** (conditional, `modes: ['streaming', 'batch']`)。

速率限制（Rate limiting）：**`rate_limit`** (conditional)。

加粗的 tags 具有 `modes` 或是 conditional 的。

## 流程

### Daemon 端：组装 envelope

```mermaid
flowchart LR
    A["GET /capabilities"] --> B["getAdvertisedServeFeatures(version, toggles)"]
    B --> C["通过 isFeatureAvailableInProtocol 过滤"]
    C --> D["对每个 feature，检查 CONDITIONAL_SERVE_FEATURES"]
    D --> E["是: predicate(toggles) ? 包含 : 丢弃"]
    D --> F["否: 无条件包含"]
    E --> G["返回 ServeFeature[]"]
    F --> G
    G --> H["封装在 envelope 中:<br/>{ v: 1, mode, features, workspaceCwd, protocol, policy }"]
```

### 客户端：feature 预检

```mermaid
sequenceDiagram
    autonumber
    participant C as 客户端
    participant D as GET /capabilities
    participant R as 路由

    C->>D: GET /capabilities
    D-->>C: { v, mode, features, workspaceCwd, protocol, policy }
    C->>C: features.includes('mcp_workspace_pool')?
    alt yes
        C->>R: 依赖 pool-aware 的响应结构<br/>(例如来自 /workspace/mcp/:server/restart 的 entries[])
    else no
        C->>R: 遗留的单条目响应结构
    end
```

## 状态与生命周期

- `CAPABILITIES_SCHEMA_VERSION` 是 wire envelope shape 版本，当前为 `1`。仅在 envelope 发生破坏性更改时才增加它。
- `SERVE_PROTOCOL_VERSION = 'v1'` 是 protocol-feature 版本。在 v1 内部添加 features 是增量添加的；旧客户端不会看到新行为，除非它们预检了新 tag。移除 feature 是 v2 的破坏性更改。
- `EVENT_SCHEMA_VERSION = 1` 是 SSE frame 的 `v` 字段（参见 [`09-event-schema.md`](./09-event-schema.md)）。它是一个独立的版本轴；增加 event schema 并不意味着增加 protocol version，反之亦然。
- `session_resume` 是 `POST /session/:id/resume` 的稳定 daemon capability。`unstable_session_resume` 仍然作为已弃用的别名被广播，因为底层的 ACP 方法仍然命名为 `connection.unstable_resumeSession`；新客户端应该进行 `session_resume` 的 feature-detect。

## 依赖

- 在构建 `/capabilities` 响应时由 `packages/cli/src/serve/server.ts` 读取。
- 开关输入来自 `runQwenServe` / `createServeApp`：`{ requireAuth, mcpPoolActive, allowOriginActive, promptDeadlineMs, writerIdleTimeoutMs, persistSettingAvailable, sessionShellCommandEnabled, rateLimit, reloadAvailable }`。
- envelope 中活动的 `permission` policy 来自 `BridgeOptions.permissionPolicy`，它本身读取 `settings.json` 的 `policy.permissionStrategy`。

## 配置

| 来源                       | 配置项                                                          | 对 capabilities 的影响                                                                                                        |
| -------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| CLI flag                   | `--require-auth`                                                | 广播 `require_auth`。                                                                                                         |
| Env                        | `QWEN_SERVE_NO_MCP_POOL=1`                                      | 停止广播 `mcp_workspace_pool` 和 `mcp_pool_restart`；MCP 事件不再标记 `scope: 'workspace'`。                                  |
| CLI flag                   | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}` | 不改变 tag 集合（`mcp_guardrails` 始终被广播），但改变每个 server 的预留和拒绝行为。                                          |
| CLI flag / env             | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1`                      | 广播 `rate_limit`。                                                                                                           |
| Embedded option            | `persistSettingAvailable`                                       | 广播 `workspace_settings` 和 `workspace_voice`。                                                                              |
| Embedded option            | `voiceTranscriptionAvailable`                                   | 广播 `workspace_voice_transcription`。                                                                                        |
| CLI flag / embedded option | `--enable-session-shell` / `sessionShellCommandEnabled`         | 广播 `session_shell_command`。                                                                                                |
| Embedded option            | `reloadAvailable`                                               | 广播 `workspace_reload`。                                                                                                     |
| Embedded option            | `voiceWsAvailable`                                              | 广播 `voice_transcribe`。                                                                                                     |
| `settings.json`            | `policy.permissionStrategy`                                     | 设置 envelope 的 `policy.permission`。                                                                                        |

## 注意事项与已知限制

- **`--require-auth` 隐藏预检。** 使用 `--require-auth` 时，所有路由（包括 `/capabilities`）都需要 bearer auth。未经认证的客户端无法预检 `caps.features.require_auth`；401 响应体是发现表面。`require_auth` tag 是针对加固部署审计 UI 的认证确认。
- **Tag 存在意味着行为存在。** 如果未来的贡献者在现有 tag 下添加行为而不增加 `since`，预检了旧 tag 的客户端可能会悄悄接收到新行为。约定是：新行为获得新 tag。
- **`unstable_*` tags 可以在版本之间改变 shape**，而无需增加 protocol。依赖它们时请固定 SDK 版本。
- 路由目录位于 [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)；本页面故意不重复它。

## 参考

- `packages/cli/src/serve/capabilities.ts`
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/server.ts`（envelope 组装）
- `packages/acp-bridge/src/eventBus.ts` (`EVENT_SCHEMA_VERSION`)
- Wire 参考：[`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
- 认证与部署防护栏：[`12-auth-security.md`](./12-auth-security.md)