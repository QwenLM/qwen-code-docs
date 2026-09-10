# REST API 集成指南

对于希望通过 HTTP 将 Qwen Code 嵌入自有产品的团队：以 `qwen serve` 作为后端，并从自己的前端驱动它。

本页是入口。完整路由参考见 [`qwen-serve-protocol.md`](./qwen-serve-protocol.md)；内部实现见 [daemon 深度解析](./daemon/00-index.md)；可运行的 TypeScript 演练见 [`examples/daemon-client-quickstart.md`](./examples/daemon-client-quickstart.md)。

## 存在哪些路径

基于 daemon 构建有六种方式，区分标准只有一个——**你拥有多少前端？**

| 路径                                 | 你拥有的部分                           | 状态                                                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| daemon + 内置 Web Shell           | 无——直接使用 shipped 版本       | 当前已发布（[用户指南](../users/qwen-serve.md)）                                                                                                                                                                             |
| daemon `--no-web` + 自有 UI      | 整个前端              | 当前已发布——**本页**                                                                                                                                                                                                    |
| daemon + 品牌化 Web Shell           | 品牌，非代码                | 尚未构建（[#11357](https://github.com/QwenLM/qwen-code/issues/11357)）                                                                                                                                                         |
| daemon + 自托管 Web Shell 构建 | 前端构建               | 尚未构建（[#11358](https://github.com/QwenLM/qwen-code/issues/11358)）                                                                                                                                                         |
| daemon via SDK `DaemonClient`        | 客户端代码，无需原始 HTTP       | 当前已发布（[TS](./sdk-typescript.md)、[Java](./sdk-java.md)）——[Python SDK](./sdk-python.md) 仅支持进程传输，没有 daemon 客户端，因此 Python 集成通过原始 HTTP 走路径 2                     |
| daemon via MCP bridge                | 无——由另一个 agent 驱动 | 以 `qwen-serve-mcp` 形式随 ` @qwen-code/sdk` 发布——参见 [bridge README](../../packages/sdk-typescript/src/daemon-mcp/serve-bridge/README.md)；`QWEN_BRIDGE_ALLOW_GLOBAL_SCOPE` 可可选地允许全局作用域写操作 |

无头模式 `qwen -p` 和面向编辑器的 ACP over stdio 是独立的集成路径。Channel 和扩展也可以通过 daemon 运行；参见 [channel 指南](../users/features/channels/overview.md) 和 [扩展参考](./qwen-serve-protocol.md#extension-management-v2-wire-contract)。

## 设计前须知

**daemon 不在进程内执行推理。** 它生成 `qwen --acp` 子进程并在它们与 HTTP 之间进行代理。它在同一 Node 二进制下运行 CLI 入口脚本，使用 `QWEN_CLI_ENTRY` 或回退到 `process.argv[1]`。嵌入 Node 后端必须将 `QWEN_CLI_ENTRY` 指向已安装的 Qwen CLI 入口脚本；`PATH` 上没有 `qwen` 查找。缺失入口点会表现为 `MissingCliEntryError`。

稳态下每个活跃工作区运行时只有**一个子进程**，而不是每个会话一个。工作区中的每个会话都多路复用到该子进程并共享其进程、OAuth 状态、文件缓存和层级内存解析。因此故障域是工作区：如果子进程退出，多路复用到它的所有会话会一起被拆除。容器大小应按 daemon 加上每个已注册工作区一个子进程来规划，并为每次 channel 切换期间每个运行时预留一个额外子进程的余量。当会话必须独立失败时，运行独立的 daemon——`--max-sessions` 限制的是并发数，而非爆炸半径。

**认证为单运营方模式。** 运行时 bearer token 授予整个 bearer 受控 API 的访问权限，可信的 loopback 调用方拥有完整权限，包括以 daemon 用户身份执行代码。没有按终端用户的主体模型。如果你将其置于多用户产品之后，你的后端负责用户身份，且不得将 daemon token 交给浏览器。容器化和多租户部署被明确推迟——参见[用户指南](../users/qwen-serve.md)中的"v0.16-alpha 已知限制"。

已配置的 channel webhook 入口（`POST /channels/:channelName/webhooks/:source`）在 bearer 认证之前使用自己的 `x-qwen-webhook-secret` 认证；在配置 channel webhook 源之前它处于非活动状态。

## 启动 daemon

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"

qwen serve --no-web --require-auth \
  --hostname 0.0.0.0 --port 4170 \
  --workspace /srv/project
```

`--no-web` 保留下面列出的路由，但禁用 Web Shell 资源和依赖表面：在 macOS 上是 `/live/*` 路由和 `/live/host` socket，在所有平台上是 `GET /mcp-app-sandbox`。通过环境变量而非 `--token` 传递 token，因为后者可通过 `/proc/<pid>/cmdline` 被任何本地用户读取。

下面的 Bash 示例通过文件描述符使用 shell 的 `printf` 内建命令传递 Authorization header，使 token 不出现在 curl 的参数中。

## 集成实际使用的路由

daemon 注册的大部分路由用于驱动 Web Shell——git 操作、扩展安装、工作区信任、语音、定时任务——并随该 UI 变化。下面的子集规模小一个数量级。

这些是 REST 集成所需的路由。其余视为内部接口。

### 发现

| 路由                                                            | 用途                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`GET /health`](./qwen-serve-protocol.md#get-health)             | 存活探针                                                               |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | 预检——在任何操作之前读取 `workspaceCwd` 和 `policy.permission` |

### 会话生命周期

| 路由                                                                                                                                | 用途                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [`POST /session`](./qwen-serve-protocol.md#post-session)                                                                             | 创建。发送 `sessionScope: "thread"` 以获得独立对话 |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid)                                                                   | 关闭。持久化的会话保留并可重新加载             |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload) · [`/resume`](./qwen-serve-protocol.md#post-sessionidresume) | 恢复持久化的会话                                           |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat)                                                    | 推迟空闲回收器                                                 |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata)                                                    | 会话元数据                                                      |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel)                                                            | 在绑定的服务内切换模型                                 |
| `GET /session/:id/status`                                                                                                            | 运行时状态——_尚无专门参考章节_                 |

### 提示与流式传输

| 路由                                                                             | 用途                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt)       | 提交。返回 `202` 表示**准入**，而非完成 |
| [`POST /session/:id/cancel`](./qwen-serve-protocol.md#post-sessionidcancel)       | 仅取消活动提示                          |
| [`GET /session/:id/events`](./qwen-serve-protocol.md#get-sessionidevents-sse)     | SSE 流。在提示**之前**订阅             |
| [`GET /session/:id/transcript`](./qwen-serve-protocol.md#get-sessionidtranscript) | 对话历史                                   |
| [`GET /session/:id/context`](./qwen-serve-protocol.md#get-sessionidcontext)       | 上下文窗口使用情况                                   |
| `GET /session/:id/export` · `GET /session/:id/pending-prompts`                    | _尚无专门参考章节_                  |

### 权限

| 路由                                                                              | 用途                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/permission/:requestId`                                          | 回答 `permission_request`。路由到拥有该会话的运行时，因此在任何工作区状态下都正确——_尚无专门章节_                                                                                                                                          |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid) | 进程全局形式，仅连接到**主**工作区的 bridge：对于由其他已注册运行时拥有的会话返回 `404`，响应体与默认 `first-responder` 策略下的丢失投票相同——因此此处的 `404` 本身并不意味着请求已被回答 |

### 只读工作区上下文

| 路由                                                                                                      | 用途                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GET /file`](./qwen-serve-protocol.md#get-file) · [`/file/bytes`](./qwen-serve-protocol.md#get-filebytes) | 读取文件或字节范围                                                                                                                                     |
| `GET /stat` · `GET /list` · `GET /glob`                                                                    | 路径元数据、目录列表、glob——_尚无专门章节_                                                                                             |
| `GET /workspace/tools`                                                                                     | 活动 ACP 子进程报告的工具；没有子进程时，响应包含 `acpChannelLive: false`、`tools: []` 和 `not_started` 错误——_尚无专门章节_ |

> **参考覆盖率。** 上述 25 个路由中有 17 个具有专门章节。
> 其余 8 个中，部分仅在行文中提及，三个完全缺失：`GET /session/:id/pending-prompts`、
> `POST /session/:id/permission/:requestId` 和 `GET /workspace/tools`。
> 弥合此差距的工作跟踪于
> [#11359](https://github.com/QwenLM/qwen-code/issues/11359)。

## 最小流程

**1. 预检。** 读取 `workspaceCwd`（以便创建时可省略 `cwd`）和 `policy.permission`（以便了解谁可以回答权限请求）。

```bash
curl -sH @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") http://daemon:4170/capabilities
```

**2. 创建会话。** 使用 `sessionScope: "thread"`，除非调用方需要共享一个对话——默认的 `"single"` 会使同一工作区的第二次创建_复用_已有会话，将不相关的调用方串行化到一个队列中。

```bash
curl -sX POST http://daemon:4170/session \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"sessionScope":"thread"}'
# → {"sessionId":"…","workspaceCwd":"/srv/project","attached":false}
```

**3. 先订阅再提示。** `Last-Event-ID: 0` 从最早保留的事件开始重放，这是捕获创建与订阅之间触发的事件（特别是 `model_switch_failed`）的方式。在**附加**时（默认的 `sessionScope: "single"` 复用已有会话），该事件是唯一表明不良 `modelServiceId` 被拒绝的信号，因为该失败故意不作为 HTTP 错误传播。在携带 `modelServiceId` 的**全新创建**时（步骤 2 的请求体不携带），`200` 响应体还携带 `modelApplied`，当切换被拒绝时为 `false`，这是要操作的确定性信号，而非有界环上的事件。不携带 `modelServiceId` 的创建完全没有 `modelApplied` 键。

```bash
curl -N http://daemon:4170/session/$SID/events \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") \
  -H 'Accept: text/event-stream' -H 'Last-Event-ID: 0'
```

每个 `data:` 行是一个完整的单行信封；信封的 `type` 与 `event:` 行匹配。

重放受 `--event-ring-size` 和固定的每订阅 8 MiB 字节预算限制。如果流发出 `state_resync_required` 且 `reason: "replay_budget_exceeded"`，通过 `POST /session/:id/load` 恢复，而不是将重放视为完成。

**4. 提示。** `202` 表示已准入，而非已完成。通过 `promptId` 关联流上的 `turn_complete` / `turn_error`。在 `turn_complete` 上读取 `stopReason`；在 `turn_error` 上读取 `message` 以及可选的 `code` / `errorKind`——参见 [`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt)。

```bash
curl -sX POST http://daemon:4170/session/$SID/prompt \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → 202 {"promptId":"…","lastEventId":42}
```

**5. 回答权限请求。** 当 agent 想要运行工具_且其审批模式要求确认_时，它会发出 `permission_request`，轮次阻塞直到有人回答或你取消——**默认没有超时**（`--permission-response-timeout-ms` 默认为 `0` = 无限等待），因此未回答的请求会持续占用会话提示队列中的槽位，直到你取消或关闭会话。如果流程需要截止时间，自行设置。

该模式是子进程自身的 Qwen 设置 `tools.approvalMode`，从 daemon 主机和 `--workspace` 目录的设置中解析；daemon 在生成时不固定任何值。其默认值为 `auto`，无需询问即可批准一类工具调用——这些调用根本不发布 `permission_request`——但仍会对其余调用询问。不受信任的工作区文件夹被强制降为 `default`（询问），这就是为什么一个部署会看到这些事件而另一个不会，且 `GET /capabilities` 报告的是投票调解策略而非审批模式，因此预检无法告知你当前处于哪种姿态。如果你的集成依赖审批门控，显式固定 `tools.approvalMode` 并提前决定如何回答：自动批准可能已经在没有任何人选择它的情况下生效。

在会话作用域路由上回答：它路由到拥有该会话的运行时，因此无论工作区配置如何都能工作。

```bash
curl -sX POST http://daemon:4170/session/$SID/permission/$REQUEST_ID \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"outcome":{"outcome":"selected","optionId":"proceed_once"}}'
```

**6. 关闭。** `DELETE /session/$SID` → `204`。磁盘上的会话被保留。

## 运维

| 关注点          | 位置                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 并发上限 | `--max-sessions`、`--max-total-sessions`；超限创建返回 `503` 并带 `Retry-After`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 速率限制    | `--rate-limit` 加上按类别的 `--rate-limit-*` 标志                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 空闲清理     | `--session-idle-timeout-ms`；通过 `POST /session/:id/heartbeat` 保持活跃                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 内存           | `--child-heap-mode` 仅为观察模式。`--memory-budget-mb` 控制 `POST /session/:id/load` 的自适应实时日志增长池，而非 SSE 重放；固定 `--max-journal-bytes` 或 `--max-journal-events` 中的任一个会禁用增长。两个标志都不会调整子进程大小或拒绝生成，也不控制其实际堆上限（`--max-old-space-size`，从主机内存派生）。预算计算参见[配置](./daemon/17-configuration.md)。SSE 重放由 `--event-ring-size` 和固定的每订阅 8 MiB 预算单独限制；缺失尾部会产生 `state_resync_required` 且 `reason: "replay_budget_exceeded"` |
| 提示截止时间 | `--prompt-deadline-ms`；超时发出 `turn_error`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 错误           | [错误分类](./daemon/18-error-taxonomy.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 可观测性    | [可观测性](./daemon/19-observability.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 完整标志列表   | [配置](./daemon/17-configuration.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |