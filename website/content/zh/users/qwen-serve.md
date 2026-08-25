# 守护进程模式（`qwen serve`）

将 Qwen Code 作为本地 HTTP 守护进程运行，使多个客户端（IDE 插件、Web UI、CI 脚本、自定义 CLI）能够通过 HTTP + Server-Sent Events 共享同一个 agent 会话，而不是各自生成独立的子进程。

> **🚧 v0.16-alpha**：`qwen serve` 首次随 v0.16-alpha 发布到 npm，仅支持**纯文本聊天/编码**和**本地部署**。prompt 路径上的图片/文件附件、容器化部署（Docker / k8s / nginx 反向代理）以及远程/多守护进程的安全加固，将在企业试点确认后通过后续补丁发布。完整的延期功能列表请参阅 [v0.16-alpha 已知限制](#v016-alpha-known-limits)。

> **状态**：阶段 1（实验性）。协议接口已锁定在 issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) 的 §04 路由表中。阶段 1.5（`qwen --serve` 标志 — TUI 共同托管同一个 HTTP 服务器）和阶段 2（进程内重构 + `mDNS`/OpenAPI/WebSocket/Prometheus 优化）紧随其后。
>
> **范围说明**：阶段 1 专为**基于协议接口开发客户端原型的开发者**以及**本地单用户/小团队协作**设计。生产级的多客户端/长时间运行/网络不稳定工作负载（如移动端伴侣应用、处理 1000+ 聊天的 IM 机器人）需要阶段 1.5+ 提供的保障，而这些在本版本中尚未包含。完整的差距列表请参阅 [阶段 1.5+ 运行时保障](#stage-15-runtime-guarantees)，融合路线图请参阅 #3803。

## 核心功能

- **内置 Web Shell UI** — `qwen serve` 开箱即在根路径（`http://127.0.0.1:4170/`）提供基于浏览器的 Web Shell；运行 `qwen serve --open` 可在浏览器中自动打开。它与 API 同源，无需额外端口或反向代理。传入 `--no-web` 可启动纯 API 守护进程。
- **最多一个主 ACP 子进程加上每个受信任次要工作区一个按需子进程，多客户端** — 生产模式会尝试预热主 bridge 并在失败后于首次使用时重试；受信任的次要运行时按需启动自己的子进程，而不受信任的次要运行时永远不会启动子进程。在默认的 `sessionScope: 'single'` 下， targeting 同一工作区的客户端共享同一个 ACP 会话，并在同一对话、同一文件 diff、同一权限提示上进行协作。
- **支持安全重连的流式传输** — 带有 `Last-Event-ID` 重连机制的 SSE 允许客户端断开后从断点处（在 ring 的重放窗口内）精确恢复。
- **分页持久化转录** — `GET /session/:id/transcript` 以重放页的形式返回完整的活跃磁盘转录，无需附加客户端或更改实时 SSE 重放窗口。
- **首个响应者权限机制** — 当 agent 请求运行工具的权限时，所有连接的客户端都会看到该请求；首个响应的客户端获得处理权。
- **一个守护进程，一个或多个工作区** — 重复 `--workspace` 可在一个监听器下注册隔离的工作区运行时。第一个工作区为主工作区，并在请求省略 `cwd` 时作为默认值。
- **实验性的守护进程托管频道** — 使用 `qwen serve --channel <name>` 启动，或先不带频道启动，之后使用 `qwen channel set` 选择。Worker 是由守护进程生命周期拥有的独立进程。其选择可以被查询、替换、重新加载和停止，而无需重启守护进程。
- **远程运行时控制** — 更改会话的审批模式（`POST /session/:id/approval-mode`），按工作区启用/禁用工具（`POST /workspace/tools/:name/enable`）或加载的 skill（`POST /workspace/skills/:name/enable`），生成空的 `QWEN.md`（`POST /workspace/init`，仅机械生成 — 不调用模型；若需 AI 填充，请接着调用 `POST /session/:id/prompt`），使用预算预检重启单个 MCP 服务器（`POST /workspace/mcp/:server/restart`），或在运行时添加/移除 MCP 服务器而无需重启守护进程（`POST /workspace/mcp/servers`，`DELETE /workspace/mcp/servers/:name`）。所有操作均受严格门控 — 需先配置 `--token`。
- **会话回顾**（[#4175](https://github.com/QwenLM/qwen-code/issues/4175) 后续）— 获取活跃会话的单句"我上次进行到哪了"摘要（`POST /session/:id/recap`）。它将核心的 `generateSessionRecap` 封装为针对快速模型的 side-query；不会污染主聊天历史或 SSE 流。非严格门控（与 `/prompt` 策略相同）；SDK 辅助方法 `client.recapSession(sessionId)`。
  - **已知限制 — token 成本放大**：该路由是纯成本端点（每次调用都是一次 LLM side-query，无状态收益），且守护进程在 v1 中没有单路由速率限制。在默认的无 token 环回配置下，有缺陷或恶意的本地客户端可能会通过大量请求消耗 token。在共享开发主机上暴露守护进程前，请配置 `--token`（以及可选的 `--require-auth`）。
  - **并发回顾安全性**：对同一会话同时发起的两个 `/recap` 调用会运行两个独立的 side-query。`generateSessionRecap` 通过 `GeminiClient.getChat().getHistory()` 读取聊天历史的快照，并将其提供给单独的 `BaseLlmClient.generateText` 调用（通过 `runSideQuery`）；它永远不会追加或修改会话的 `GeminiChat`。可安全地从多个客户端并发调用，无需协调。

## v0.16-alpha 已知限制

`qwen serve` 的首个 npm 版本（v0.16-alpha）范围有意收窄 — 仅支持在本地机器上运行守护进程的开发者进行纯文本聊天/编码。以下列表明确了延期的功能范围，以便采用者据此规划；此处的所有功能均在 v0.16.x 补丁路线图或近期后续版本中。

**产品功能范围 — 纯文本：**

- ✅ 文本 prompt 和文本响应（聊天、编码、工具调用、MCP 集成）
- ❌ **prompt 路径上的图片/文件附件** — `MessageEmitter` 目前仅渲染文本；多模态回显将在确认有图片需求的 alpha 目标后落地（#4175 chiga0 #27 P0 项）
- ❌ **流式上传** — 与多模态相同的门控条件

**部署范围 — 仅限本地：**

- ✅ 环回（`127.0.0.1`，默认）— 无需身份验证，适合开发工作站
- ✅ 通过 `systemd` / `launchd` / `nohup &` / `tmux` 本地启动 — 参见 [本地启动模板](./qwen-serve-deploy-local.md)
- ✅ 通过 `QWEN_SERVER_TOKEN` 环境变量自带 bearer token（设置详见[身份验证](#身份验证)）
- ❌ **容器化部署** — Docker / Compose / Kubernetes / 带 TLS 终止的 nginx 反向代理不包含在 v0.16-alpha 中。延期至 v0.16.x，待企业试点确认后实施（否则将因无人验证而荒废）。
- ❌ **单主机上的多守护进程协调** — 一个守护进程可以托管多个显式注册的工作区，但守护进程之间不会相互协调。跨主机联邦、实例路径 token 键控和过期 token 清理延期至 v0.16.x。
- ✅ **可撤销的 Local Control 配对 token** — `--local-control` 生成一个由守护进程拥有的独立局域网配对 token。通用守护进程 token 存储仍需自带 token。

**安全加固 — 本地单用户最低可用：**

- ✅ 启动时安全门控（在无 token 情况下拒绝非环回绑定，[PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236)）
- ✅ 变更路由身份验证门控，会话级权限路由（Wave 4 PR）
- ✅ MCP 防护栏 + 多客户端权限协调（F2 / F3）
- ✅ **Prompt 绝对截止时间 + SSE writer 空闲超时** — 通过 `--prompt-deadline-ms` 和 `--writer-idle-timeout-ms` 启用；启用后通过 `prompt_absolute_deadline` 和 `writer_idle_timeout` 公布。
- ✅ **HTTP 速率限制** — 通过 `--rate-limit` 和每级阈值启用；启用后通过 `rate_limit` 公布。
- ⏸️ **Prometheus 指标 + 负载测试工具** — 延期至 v0.17 F4 Phase-1 规模 instrumentation，待 30-50 个活跃会话成为实际目标时实施。
- ⏸️ **`--max-body-size` CLI 标志** — 守护进程默认强制执行 `express.json({ limit: '10mb' })`，这足以覆盖纯文本 prompt（模型上下文窗口远小于 10 MiB 字符）。可在 v0.16.x 中通过标志调整。

有关"阶段 1 中我们不会修复什么"的更详细枚举（单主机会话状态变更模型 + N 个并行会话共享每个工作区运行时内的一个 ACP 子进程），请参阅下方的[阶段 1 范围边界 — 阶段 1.5 中我们不会修复什么](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15)。

## 快速开始

### 1. 启动守护进程（环回，无身份验证）

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

默认绑定为 `127.0.0.1:4170`。在环回地址上 bearer 身份验证**默认关闭**，以便本地开发"开箱即用"。守护进程将当前工作目录注册为主工作区；使用绝对路径 `--workspace /path/to/dir` 可覆盖，重复该标志可注册额外的隔离运行时。

**打开 Web Shell UI。** 浏览至 `http://127.0.0.1:4170/`（或使用 `qwen serve --open` 启动守护进程以自动打开）即可进入完整的浏览器终端 — 包含聊天、diff、提交历史、工具调用和权限提示。UI 在守护进程根路径提供，与 API 同源。本指南的其余部分使用原始 HTTP，以便你可以直接通过脚本调用 API。

对于无需手动创建 token 的已认证单用户启动，请显式选择：

```bash
qwen serve --open-with-auth
```

此仅限环回的模式在 `--token` 和 `QWEN_SERVER_TOKEN` 都未提供时生成一个 256 位的 bearer token，然后将其作为 `#token=` URL 片段传递给打开的 Web Shell。Shell 会移除片段并将凭据保留在该标签的 `sessionStorage` 中；刷新有效，但关闭标签或重启守护进程会丢失凭据。在 CI、SSH 或其他无法自动打开的环境中，守护进程会启动并打印包含机密的片段 URL 以供手动打开。

该标志默认关闭，包含浏览器打开行为，需要 Web Shell、已构建的 Web Shell 资源和环回绑定。裸 `qwen serve --open` 在环回地址上仍然无 token。在已认证打开模式下，普通 API 路由会拒绝没有 bearer 的其他本地客户端；静态 Web Shell 资源和环回 `/health` 保持其现有的预认证行为，除非同时设置了 `--require-auth`。对于多个客户端或可重新打开的 Web Shell，请使用稳定的共享 token：

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --open
```

### 2. 基础检查

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

`workspaceCwd` 字段暴露主兼容性工作区，以便客户端可以在 `POST /session` 中有意省略 `cwd`。当前客户端应从 `workspaces[]` 中选择一个受信任条目，并在显式 targeting 某个运行时发送该条目的 `cwd`。
`limits.maxPendingPromptsPerSession` 字段公布了当前每个会话的 prompt 准入上限；`null` 表示禁用该上限。`limits.maxTotalSessions` 公布可选的守护进程级新会话上限；`null` 表示无限制。

### 从守护进程运行频道

```bash
# Start one configured channel under qwen serve
qwen serve --channel telegram

# Start several configured channels under daemon-owned workspace workers
qwen serve --channel telegram --channel feishu

# Start all configured channels
qwen serve --channel all

# Or start a token-protected daemon with no channel worker
QWEN_SERVER_TOKEN=secret qwen serve


# Enable or replace its runtime selection later
qwen channel set telegram --token secret
qwen channel set telegram feishu --token secret
qwen channel set all --token secret

# Inspect or stop daemon-managed channels
qwen channel status --daemon-url http://127.0.0.1:4170 --token secret
qwen channel stop --daemon-url http://127.0.0.1:4170 --token secret
```

此模式为实验性且由守护进程管理。它不会取代独立的 `qwen channel start` 命令：不带 `--daemon-url` 时，现有的 `qwen channel start`、`stop` 和 `status` 行为保持独立。使用 `qwen serve --channel` 时，守护进程会在监听之前预留频道服务租约，如果初始 worker 无法就绪则启动失败。不带 `--channel` 时，它不加载任何频道运行时，也不预留频道服务租约，直到第一次运行时 PUT。如果已就绪的 worker 后来崩溃，守护进程会继续运行，在有界重启策略下重新启动它，并在 `GET /daemon/status` 中报告其状态（包括 `channel_worker_exited` 警告）。

运行时控制通过 `GET`、`PUT` 和 `DELETE /workspace/channel` 暴露；SDK 辅助方法为 `getChannelWorkerControl()`、`setChannelWorkerSelection()` 和 `stopChannelWorker()`。PUT/DELETE/reload 使用严格变更门控，因此守护进程必须配置 bearer token。运行时选择是故意临时性的：PUT 不会编辑设置或启动选项，重启会回到 `qwen serve --channel` 的选择（省略该标志时则为禁用）。命名选择会按首次出现顺序去重和修剪；顺序会被保留，因为第一个频道可能影响共享模型选择。

守护进程在其 worker 启动时读取每个频道的设置（token、`proxy`、每频道 `model`）。要在不更改已提交选择的情况下重新读取设置，请调用 `POST /workspace/channel/reload`（SDK `client.reloadChannelWorker()`，或 `qwen channel reload`）。Reload 会重新解析工作区归属，并通过相同的回滚安全协调路径重启选定的 worker。`channel_control` capability 在运行时控制被接入时始终存在；`channel_reload` 仅在管理器启用时存在。持久化线程会从磁盘恢复。

每个选定频道的 `cwd` 必须解析为已注册的工作区，频道按所属工作区分组：单工作区守护进程运行一个 worker（与之前相同）；多工作区守护进程（`--workspace` 重复）为每个拥有选定频道的工作区运行一个 worker，每个 worker 绑定到该工作区的 cwd、`QWEN_DAEMON_WORKSPACE` 和环境变量覆盖。要在非主工作区中托管频道，请在该工作区自己的 `.qwen/settings.json` 中定义它（无需 `cwd`）或设置显式 `cwd` 等于工作区路径；仅在用户/系统作用域中定义且没有 `cwd` 的频道在工作区间是模糊的，会导致启动错误。`--channel all` 保持仅主工作区（它托管主工作区的频道），不能与命名频道结合使用。

替换选择会在停止任何内容之前预检配置、归属和信任。它会保留有序选择未更改的工作区 worker。如果更改后的 worker 无法启动，守护进程会停止新 worker 并恢复旧选择。如果守护进程无法确认旧子进程即使在 SIGKILL 后也已退出，它会保留 PID 租约并拒绝创建重复 worker。当至少一个请求的适配器连接时，worker 仍被视为就绪；PUT 然后返回 `partial: true`，`/daemon/status` 为缺失的适配器报告 `channel_worker_partial_connect`。

当适配器拒绝 `connect()` 时，当前 worker 快照可能包含 `startupFailures` 条目，其中有频道、`phase: "connect"`、可选的适配器代码和凭据已编辑的消息。`qwen channel set`、`qwen channel reload` 和远程 `qwen channel status --daemon-url …` 会打印这些原因。如果在动态 set 或 reload 期间每个适配器都失败，命令会收到 `502 channel_worker_start_failed`；响应原因描述该次尝试，其 `state` 描述回滚后的结果。后续状态请求不会保留失败尝试。每个 worker 启动最多保留 64 个原因，适配器代码应被视为诊断性的而非稳定类别。初始 `qwen serve --channel …` 启动在没有适配器连接时仍然退出。

守护进程还为客户端 UI 和运维人员暴露只读的运行时快照：`GET /daemon/status`、`GET /workspace/mcp`、`GET /workspace/skills`、`GET /workspace/providers`、`GET /workspace/env`、`GET /workspace/preflight`、`GET /workspace/:id/session-info`、`GET /session/:id/status`、`GET /session/:id/context`、`GET /session/:id/supported-commands`、`GET /session/:id/tasks`、`GET /session/:id/lsp` 和 `GET /session/:id/transcript`。

`GET /workspace/:id/session-info`（以及复数形式 `GET /workspaces/:workspace/session-info`）返回工作区的聚合会话计数：持久化的 `active` / `archived` / `total`，加上当实时状态可用时的当前内存中 `live` 计数。已注册的不受信任次要工作区会省略 `live`，因为其目录读取不会查询实时 bridge。分页的 `GET /workspace/:id/sessions` 列表不包含总数，因此这是"存在多少会话？"的专用接口 — 在计划任务或定期任务留下大量本地存储时很有用。

> ⚠️ **磁盘扫描 — 请勿轮询。** 此端点会遍历工作区 chats 目录下的本地会话 JSONL 文件。响应始终包含 `expensive: true` 和 `cost: "disk_scan"`。请低频调用（手动刷新、运维工具、偶尔的 UI 加载）— 绝不要在紧密计时器上或每次侧边栏渲染时调用。浏览页面请使用 `GET /workspace/:id/sessions`，获取实时内存中会话计数请使用 `GET /daemon/status`。`truncated: true` 的响应意味着扫描达到了安全限制或无法分类每个候选文件，因此持久化计数是下界。

```bash
curl http://127.0.0.1:4170/workspace/$(python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.getcwd(), safe=''))")/session-info
# → {"active":450,"archived":30,"total":480,"live":2,"expensive":true,"cost":"disk_scan"}
```

`GET /session/:id/status` 返回单个会话的实时 bridge 摘要：`sessionId`、`workspaceCwd`、`createdAt`、可选的 `displayName`、`clientCount` 和 `hasActivePrompt`。当守护进程持有该 id 的活跃会话时返回 `200` 及摘要，否则返回 `404`（body 为 `{ "error": …, "sessionId": … }`）。使用它来轮询某个已知会话是否仍在运行（`hasActivePrompt`）或有多少客户端连接（`clientCount`），而无需获取并扫描整个分页会话列表：

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

这是原始的实时会话视图，因此 `clientCount` 和 `hasActivePrompt` 与 `GET /workspace/:id/sessions` 中的对应条目匹配 — 但这两个路由并非字节级完全相同。列表端点会用持久化的会话存储数据丰富每个条目：其 `createdAt` 是持久化的首次 prompt 时间，并添加了 `updatedAt` 以及从存储的标题或首次 prompt 派生的 `displayName`。而 `/status` 报告的是实时会话自身的 `createdAt`，省略 `updatedAt`，并且仅在实时会话上设置了 `displayName` 时才返回。

`GET /session/:id/lsp` 返回结构化的每会话 LSP 状态。使用 `--experimental-lsp` 启动守护进程以在生成的 agent 会话中启用 LSP；否则该路由返回 `enabled: false` 且无服务器。

`GET /daemon/status` 是综合的故障排查快照。默认的 `detail=summary` 仅读取内存中的守护进程状态（会话、权限、SSE/ACP 传输计数、速率限制拒绝、进程内存、已解析的限制），且不会启动 ACP 子进程。在主动排查问题时，使用 `GET /daemon/status?detail=full` 获取每会话诊断、ACP 连接详情、身份验证设备流计数和工作区状态部分。

`GET /workspace/mcp`、`GET /workspace/skills` 和 `GET /workspace/providers` 报告实时的 ACP 运行时，且在空闲时不会启动 ACP 子进程；空闲的守护进程返回 `initialized: false` 及空快照。一旦会话存活，它们将切换为 `initialized: true` 并暴露真实状态。

要远程镜像 CLI `/skills` 面板，请在检查 `workspace_skill_toggle` capability 后调用 `POST /workspace/skills/:name/enable` 并传入 `{ "enabled": true | false }`。要更改多个 Skill，请检查 `workspace_skill_batch_toggle` 并调用 `POST /workspace/skills/enable` 并传入 `{ "skillNames": ["review", "deploy"], "enabled": false }`；其响应将成功的 `results` 与每个目标的 `errors` 分开，一起持久化有效目标，并刷新活跃的 ACP 会话一次。该路由根据需要更新工作区的 `skills.disabled` 和 `skills.enabled`，拒绝未知、隐藏、非活跃扩展、高作用域锁定和不受信任的目标。启用 `skills.defaultDisabled` 的 skill 会在 `skills.enabled` 中写入规范的选择加入；从更高作用域继承的硬 `skills.disabled` 条目仍然无法被覆盖。Skill 状态单元格暴露 `disabledReason`（`hard`、`default` 或 `inactive_extension`）和可选的 `lockedScope`。`deferred` 响应表示在没有 ACP 子进程运行时保存了设置；它将在子进程启动时生效。`skills.disabled` 同时禁用手动和模型使用，不同于 `disable-model-invocation: true`（后者保留直接 `/skill-name` 调用可用）。对于 V2 Extension 批次，请检查 `extension_batch_activation_v2`：`PUT /extensions/activation` 更改全局默认值，而 `PUT /workspaces/:workspace/extensions/activation` 更改选定工作区的精确覆盖并接受 `"inherit"` 来清除它们。两者都接受 `extensionNames` 中的名称；`enabled` 和 `disabled` 可以在安装前声明，而对未知名称的 `inherit` 是空操作。每个请求返回一个可轮询的操作。

`GET /workspace/env` 和 `GET /workspace/preflight` 无论 ACP 状态如何，始终返回 `initialized: true`。`env` 从不咨询 ACP（仅守护进程信息）；`preflight` 从 `process.*` 响应守护进程级单元格，并在子进程空闲时为 ACP 级单元格发出 `status: 'not_started'` 占位符。

`GET /workspace/env` 报告守护进程运行时的 runtime、platform、sandbox、proxy，以及白名单 secret 环境变量（如 `OPENAI_API_KEY`）的**存在性**（绝不返回值）。代理 URL 在发送到网络前会被剥离凭据并简化为 `host:port`。该路由始终直接从守护进程响应，且从不生成 ACP 子进程。

`GET /workspace/preflight` 返回就绪检查列表。**守护进程级单元格**（Node 版本、CLI 入口、工作区目录、ripgrep、git、npm）始终渲染。**ACP 级单元格**（身份验证、MCP 发现、skills、providers、工具注册表、出站）需要活跃的 ACP 子进程 — 当守护进程空闲时，它们发出 `status: 'not_started'` 占位符，而不是为了填充它们就生成 ACP。失败映射到封闭的 `errorKind` 枚举（`missing_binary`、`auth_env_error`、`init_timeout`、`restore_timeout`、`protocol_error`、`missing_file`、`parse_error`、`blocked_egress`），以便客户端 UI 渲染结构化的修复建议。

守护进程还暴露工作区文件辅助工具：

- `GET /file` 读取文本文件。完整快照响应返回原始字节的 `sha256:<hex>` 哈希；来自超过 256 KiB 文件的有限行窗口会省略它。
- `GET /file/bytes` 读取有界的原始字节窗口并返回 base64 内容。
- `POST /file/write` 创建或替换文本文件。
- `POST /file/edit` 应用一次精确的文本替换。

Write/edit 是**严格变更路由**：即使在环回地址上也需要配置 bearer token，否则返回 `token_required`。替换和编辑需要来自完整快照 `GET /file`（或全窗口 `GET /file/bytes`）的最新 `expectedHash`。部分大文件窗口不能用作乐观并发 token。`create` 永远不会覆盖。允许对忽略路径进行显式写入，但会被审计。二进制写入、删除/移动/mkdir 以及递归父目录创建不属于此接口范围。

### 3. 打开会话

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

可以省略 `cwd` — 路由将回退到守护进程的主工作区。提交无法规范化为任何已注册工作区的 `cwd` 会返回 `400 workspace_mismatch`。

第二个向同一已解析工作区运行时提交 `/session` 的客户端在默认的 `sessionScope: 'single'` 下会得到 `"attached": true` — 他们现在共享该运行时的 agent 会话。省略 `cwd` 会解析为主工作区；选择另一个已注册的工作区会创建或附加到该运行时的独立默认会话。

### 4. 订阅事件流（先在另一个终端中执行）

```bash
SESSION_ID="<from step 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

`data:` 行是**完整的事件信封** — `{id?, v, type, data, originatorClientId?}` — 在单行上进行 JSON 字符串化。ACP 负载（本例中的 `sessionUpdate` 块）位于该信封内的 `data` 下。SSE 级的 `id:` / `event:` 行是为了方便 EventSource 客户端；相同的值也出现在 JSON 信封内，因此 raw-`fetch` 消费者也能获取它们。

请在发送 prompt **之前**打开此流 — SSE 重放缓冲区保存最近的 8000 个事件，因此迟到的订阅者可以通过 `Last-Event-ID` 赶上进度，但对于简单的"观察单个 prompt"场景，最简单的方法是先订阅并让其实时流式传输。

该流发出 `session_update`（LLM 块、工具调用、使用情况）、`permission_request`（工具需要审批）、`permission_resolved`（有人投票）、`model_switched`、`model_switch_failed`，以及终止帧 `session_died`（agent 子进程崩溃 — SSE 随后关闭）和 `client_evicted`（你的队列溢出 — SSE 随后关闭）。

### 5. 发送 prompt（回到原始终端）

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

步骤 4 中的 `curl -N` 会在帧到达时打印它们。

### 可选的 Todo 停止守卫

长时间运行的守护进程客户端可以选择在当前工作链成功写入顶级 Todo 列表并在仍有待处理或进行中的项目时停止的情况下，进行有界续写。将此添加到 `settings.json` 并重启守护进程：

```json
{
  "experimental": {
    "todoStopGuard": true
  }
}
```

该守卫最多添加两次连续的 primary-model 调用（无新用户输入）。中途的用户消息会首先运行并开始一个新的两阶段尝试；retry/continue 和相关的后台结果保留当前阶段的预算。每次调用和最终的耗尽状态都作为可重放的 `session_update` 事件出现，带有 `_meta.source: "todo_stop_guard"`；元数据包含尝试次数和未完成计数，但从不包含 Todo 文本。排队的完整 prompt 也会首先运行，现有的权限/取消规则不变。

当已武装的链在等待相关后台工作时，不相关的 cron/loop 触发和旧任务通知会被延迟。定期工作在每个任务上有界并合并，直到链让出。

该选项默认为 `false`，需要重启，在安全模式、裸模式和审批 `plan` 模式下被强制关闭。它仅在内存中：从磁盘加载 Todo 状态或重启守护进程不会武装它。新的普通 prompt 必须成功运行自己的顶级 `todo_write`；retry/continue 和实时客户端重新附加保留当前的内存中工作链。成功更改会话工作目录会清除它，因此旧 Todo 无法在新工作区中恢复。

## 身份验证

对于环回地址之外的任何访问，你**必须**传递 bearer token：

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → boot refuses without QWEN_SERVER_TOKEN
```

然后客户端在每个请求上发送 `Authorization: Bearer $QWEN_SERVER_TOKEN`。`/health` **仅在环回绑定上**被豁免，因此 pod 内的 k8s/Compose 存活探针（守护进程监听 `127.0.0.1` 的位置）不需要凭据。在非环回绑定（如 `--hostname 0.0.0.0` 等）上，`/health` 像其他路由一样需要 token — 否则攻击者可以探测任意地址以确认守护进程的存在。使用 `/capabilities` 来端到端验证你的 token 是否正确（它始终需要身份验证）：

> **加固的环回（`--require-auth`）。** 默认的环回无 token 行为适用于单用户笔记本电脑，但在共享开发主机、CI 运行器或多租户工作站（任何本地用户都可以 `curl 127.0.0.1:4170`）上是不安全的。传递 `--require-auth` 可使 bearer token 在每个路由上都是强制的 — 包括 `/health` 和 `/capabilities` — 即使绑定到 `127.0.0.1`。没有 token 则启动失败。启用该标志后，**未身份验证**的客户端无法读取 `/capabilities` 来发现需要身份验证；发现表面就是 401 响应 body 本身。身份验证后，`caps.features.require_auth` 标签是部署已加固的 post-auth 确认（对审计/合规 UI 很有用）：
>
> ```bash
> qwen serve --require-auth --token "$(openssl rand -hex 32)"
> # → /health, /capabilities, /session, … all require Authorization: Bearer …
> curl http://127.0.0.1:4170/health
> # → 401
> curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
> # → 13   (or whatever index — non-null after authenticating means the tag is present)
> ```

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Wrong token → 401
```

token 比较是恒定时间的（SHA-256 + `crypto.timingSafeEqual`）；401 响应在"缺少 header"、"错误 scheme"和"错误 token"之间是统一的，因此侧信道无法区分。

`--open-with-auth` 是 CLI 拥有的便利功能，不是另一个守护进程 token 来源：当该选项已定义时（即使是空白），它选择 `--token`，否则选择 `QWEN_SERVER_TOKEN`，然后修剪选定的值，仅在结果为空时生成。守护进程不会持久化生成的值，也不会将其导出为 `QWEN_SERVER_TOKEN`；现有的内部已认证子进程交接保持不变。Web Shell 仅将浏览器副本存储在接收标签的 `sessionStorage` 中；此模式不添加跨标签或外部客户端的凭据发现机制。该 token 不可独立撤销，也不与客户端身份绑定。持有者获得与任何其他 bearer token 相同的守护进程权限。请参阅[已认证 Web Shell 启动设计](../design/2026-08-22-serve-open-with-auth.md)以及 [#4514](https://github.com/QwenLM/qwen-code/issues/4514) 中的相关后续工作。

## HTTPS / TLS（用于移动端/跨设备访问）

默认情况下，守护进程提供纯 HTTP 服务。这在 `localhost` 上没问题，但通过 `http://` 访问 LAN IP（`https://192.168.x.x:4170`）的手机或平板**不是**[安全上下文](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) — 因此浏览器会阻止 `getUserMedia`（语音输入）、WebRTC 和其他仅限安全上下文的 API。传递 `--tls-cert` + `--tls-key` 可通过 HTTPS 提供 Web Shell 并解锁这些功能：

```bash
# 1. 安装本地 CA 并信任它（一次性操作）。移动设备也必须
#    信任此 CA —— mkcert 会打印根证书所在的路径。
mkcert -install

# 2. 为机器的局域网 IP 生成证书。同时将 localhost / 127.0.0.1 添加到
#    SAN 中：使用 `--open` 时，守护进程会将浏览器 URL 重写为
#    127.0.0.1，因此如果证书仅作用于局域网 IP，将会被拒绝并报错
#    ERR_CERT_COMMON_NAME_INVALID。（mkcert 会根据所有主机名来命名输出文件。）
mkcert 192.168.1.100 localhost 127.0.0.1

# 3. 通过 HTTPS 启动守护进程。非环回地址绑定仍然需要 token，
#    并且必须通过 CORS 允许浏览器的 Origin。
qwen serve \
  --hostname 0.0.0.0 \
  --token "$(openssl rand -hex 32)" \
  --tls-cert "./192.168.1.100+2.pem" \
  --tls-key "./192.168.1.100+2-key.pem" \
  --allow-origin "https://192.168.1.100:4170"
# → qwen serve listening on https://0.0.0.0:4170
```

注意事项：

- **两个参数必须同时使用或同时不使用** —— 如果只提供一个，启动将失败（没有私钥的证书无法启动 HTTPS 监听器）。
- **TLS 与认证正交** —— HTTPS 加密传输层；bearer token 仍然控制着每个 API 路由。无论是否使用 TLS，非环回地址绑定都需要 token。
- **作用域仅限 TLS 终端** —— 不支持自动生成，不支持 ACME / Let's Encrypt。这主要是为了局域网/开发环境的便利；对于面向互联网的部署，请在反向代理处终止 TLS（参见下方的威胁模型）。

## CLI 参数

| 参数                                    | 默认值         | 用途                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | `4170`          | TCP 端口。`0` 表示操作系统分配的临时端口。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--hostname <addr>`                     | `127.0.0.1`     | 绑定接口。除环回地址外的任何绑定都需要 token。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--local-control`                       | `false`         | 在一个选定的私有 IPv4 接口上共享 Web Shell，使用守护进程拥有的可撤销配对 token、终端二维码、精确的浏览器 origin 和尽力而为的睡眠抑制。与 `--token`、`--allow-origin` 和 `--port 0` 组合使用；与 `--no-web` 和非默认的 `--hostname` 冲突。当有多个局域网候选地址时使用 `--local-control-address`，添加 `--tls-cert` + `--tls-key` 以解锁安全上下文浏览器 API（如语音输入）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--local-control-address <ip>`         | —                  | 当主机有多个候选地址时，共享哪个局域网 IPv4 地址。仅在 `--local-control` 报告模糊选择时需要。 |
| `--token <str>`                         | —               | Bearer token。回退到 `QWEN_SERVER_TOKEN` 环境变量（会自动去除首尾空格 —— 方便使用 `$(cat token.txt)`）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--require-auth`                        | `false`         | 如果没有 bearer token 则拒绝启动，即使在环回地址上也是如此。加固了 `127.0.0.1` 的开发者默认配置，适用于共享开发主机 / CI 运行器 / 多租户工作站等任何本地用户都能访问监听器的场景。仅在设置了 `--token` 或 `QWEN_SERVER_TOKEN` 时才能启动；同时也会将 `/health` 置于 bearer token 保护之下。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--tls-cert <path>`                     | —               | PEM 证书文件的路径。通过 **HTTPS** 而非 HTTP 提供服务。必须与 `--tls-key` 配对使用（如果只提供一个则启动失败）。通过局域网 IP 解锁安全上下文浏览器 API —— 如语音输入（`getUserMedia`）、WebRTC —— 否则浏览器会在纯 `http://` 下阻止这些 API。仅限 TLS 终端；不支持自动生成 / ACME。参见下方的 [HTTPS / TLS](#https--tls-for-mobile--cross-device-access)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--tls-key <path>`                      | —               | PEM 私钥文件的路径。必须与 `--tls-cert` 配对使用。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--max-sessions <n>`                    | `32`            | 并发活跃会话的上限。当达到上限时，会生成新子进程的新 `POST /session` 请求将返回 `503`（并带有 `Retry-After: 5`）；附加到现有会话的请求不计入此限制。设置为 `0` 可禁用。此默认值适用于单用户/小团队使用；如果你的部署环境有足够的 RAM/文件描述符余量（每个会话约 30–50 MB），可以调高此值。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--max-total-sessions <n>`              | 派生值          | 可选的非负整数，跨所有已注册工作区运行时的守护进程级新会话创建上限。它适用于新子会话、会话恢复和分支/派生创建的会话；附加到现有活跃会话不消耗名额。设置为 `0` 表示无限制。当省略且有多个启动/恢复的工作区时，守护进程根据每工作区上限和启动工作区数量派生一个固定上限；后续动态注册不会重新计算。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `--max-pending-prompts-per-session <n>` | `5`             | 每个会话中由 `POST /session/:id/prompt` 接受但尚未处理的 prompt 上限，包括排队的 prompt 和当前活动的 prompt。当溢出时，bridge 会在返回 `promptId` 之前同步拒绝，返回 `503`、`Retry-After: 5` 和 `code: "prompt_queue_full"`。设置为 `0` 可禁用。`branchSession` 在同一个 FIFO 上串行化，但不计入此 prompt 上限。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--workspace <path>`                    | `process.cwd()` | 此守护进程注册的绝对工作区目录。重复该标志可在一个进程中托管多个工作区；第一个为主工作区，并在请求省略 `cwd` 时作为默认值。相对路径会被拒绝。`cwd` 未注册的会话请求返回 `400 workspace_mismatch`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--memory-project-scope <mode>`         | `workspace`     | 项目内存分区模式。`workspace`（默认）按精确的已注册工作区目录键控内存，使每个守护进程工作区获得自己的隔离内存；`git-root` 是解析到同一 Git 根的工作区共享的旧版兼容模式。提供时覆盖 `QWEN_CODE_MEMORY_PROJECT_SCOPE`；空白的环境变量值被视为未设置，而无法识别的非空值会被忽略并带有一次性警告，保留旧版 `git-root` 行为。新默认值不会迁移现有的 git-root 项目内存 — 在迁移期间请使用显式的 `git-root` 作用域读取这些条目。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--channel <name\|all>`                 | —               | 实验性的守护进程管理的频道 worker。重复此参数可选择多个已配置的频道，或传递 `all` 以启动所有已配置的频道。`all` 不能与命名频道结合使用。所选频道的 `cwd` 值必须解析为已注册的工作区；多工作区守护进程为每个拥有频道的工作区运行一个 worker。worker 由 `qwen serve` 拥有；停止守护进程即可停止由 serve 管理的频道。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--max-connections <n>`                 | `256`           | 监听器级别的 TCP 连接上限（`server.maxConnections`）。限制原始 socket 数量，与会话数量无关 —— 一旦达到上限，缓慢/幽灵 SSE 客户端将在 accept 时被拒绝。如果你的部署预期每个会话有许多 SSE 订阅者，请将其与 `--max-sessions` 一起调高。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--memory-budget-mb <n>`                | cgroup/主机的 50% | 整个守护进程进程树的总内存预算（MB）。未设置时，派生为 cgroup 限制或主机内存的 50%；无论如何，有效值被限制为已解析的可用内存，配置值和有效值都会被报告。它不会更改任何 `qwen --acp` 子进程的大小；目前唯一的消费者是自适应 live-journal 增长：一个守护进程级的增长池，派生为有效预算的 5%（上限为 `1024` MB；在报告 `insufficientMemory` 的主机上池为 0 且自适应增长被禁用），由每个工作区 bridge 共享 — 参见 `--max-journal-bytes`。已解析的数字出现在 `GET /daemon/status` 的 `limits.memory` 下，以及已注册和活跃子进程计数和 `runtime.memory` 下的建议每子进程份额。太小的主机会报告 `insufficientMemory` 而不是向上钳制；由于派生比例为 50%，任何低于 ~2 GB 的主机都会触发此警告。在此类主机上传递显式的 `--memory-budget-mb 1024` 以覆盖派生值（该标志仍需要至少 1024 MB 的可用内存才能清除警告）。必须是 `[1024, 1048576]` 范围内的整数。                                                                                                                                                                                                                                                              |
| `--memory-pressure-mode <mode>`         | `observe`          | 守护进程是否将自身的内存读数转化为判定。`observe`（默认）在 `GET /daemon/status` 的 `runtime.memory.pressure` 下报告压力级别，并在级别离开 `normal` 时发出 `daemon_memory_pressure` issue — 一个 `warning`，因此整体 `status` 保持 `ok`。`off` 仍然报告所有数字（包括级别），但不发出 issue，因此整体 `status` 不变；在校准时使用，或者如果你对顶层状态进行告警。级别取两个比率中较差的一个：RSS 与可用内存（cgroup OOM killer 监视的比率）以及 V8 堆已用与此进程的堆上限。它仅覆盖守护进程根进程；将其与 `runtime.memory.children.rssBytes` 进行比较以了解子进程。两种模式都不执行修复。可选值为 `off`、`observe`。                                                                                                                                                                                                                                                                                        |
| `--child-heap-mode <mode>`              | `observe`          | 守护进程是否对 `--memory-budget-mb` 建模每子进程堆分区。`observe`（默认）报告它将应用的内容 — `limits.memory.childHeap.perChildCeilingMb` 和 `maxConcurrentChildren` — 并计数本会超出限制的生成。**不会应用任何内容**：不会从预算中确定子进程大小，也不会拒绝生成。`off` 不进行建模，并在有线消息中说明：`maxConcurrentChildren` 和 `perChildCeilingMb` 均为 `null`，而非携带你已关闭的分区。拒绝计数为 0 **并不**意味着分区可以安全应用：子进程仍然在更大的主机派生上限上运行，因此需要比建模上限更多旧空间的工作负载在此处看起来完全健康。应用该分区时会附带能够回答该问题的测量数据。                                                                                                                                                                                                                                                                                  |
| `--event-ring-size <n>`                 | `8000`          | 每个会话的 SSE 重放环形缓冲区深度（#3803 §02 目标）。设置 `GET /session/:id/events` 配合 `Last-Event-ID: N` 可用的积压量。值越大 = 重连余量越多，代价是每个会话多消耗几百 KB 的 RAM。SDK 客户端还可以通过 `?maxQueued=N`（范围 `[16, 2048]`，默认 256）为特定订阅请求更大的每订阅者积压上限。守护进程还会在队列填充达到 75% 时发出非终止的 `slow_client_warning` SSE 帧，以便客户端在被驱逐前进行排空/重连。预检 `caps.features.slow_client_warning`。                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--compacted-replay-max-bytes <n>`      | `4194304`          | `POST /session/:id/load` 返回的有界快照中保留的重放事件的每活跃会话字节上限。该上限适用于 `compactedReplay`；当前飞行中的 `liveJournal` 由 `--max-journal-events` 和 `--max-journal-bytes`（基线上限，自适应增长可以调高 — 参见 `--max-journal-bytes`）分别限制。值必须是正安全整数；无效值在启动时失败，硬上限为 256 MiB。当较旧的保留重放被丢弃时，快照以 `history_truncated` 开头。这不会限制磁盘上的转录。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--max-journal-events <n>`              | `10000`            | 每个会话在当前未完成 turn 的飞行中 `liveJournal` 中保留的重放条目的基线上限。连续的兼容文本或思考 chunk 共享一个条目，每个条目最多 256 个源事件；其他事件边界会被保留。超出时，守护进程首先尝试自适应增长（参见 `--max-journal-bytes`）；如果没有获得增长余量或获得的余量不足以覆盖超出量，最旧的条目会被丢弃，并在前面加上 `history_truncated` 标记。标记的 `truncatedEvents` 和 `retainedEvents` 计数描述的是源事件。必须是正安全整数。固定此标志（或 `--max-journal-bytes`）会禁用自适应增长。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--max-journal-bytes <n>`               | `8388608`          | 每个会话的飞行中 `liveJournal` 基线字节上限，从序列化的源事件计算，即使兼容的 chunk 共享一个重放条目。当 turn 超过上限时，自适应增长将会话的上限提升至双倍（上限为每会话 256 MiB 的硬上限，受剩余池余量限制），同时跨守护进程所有活跃会话的增长共享一个增长池，该池大小为守护进程有效内存预算的 5% — 即传入的 `--memory-budget-mb` 值，限制在已解析的可用内存，否则为自动检测内存的 50%（参见 `--memory-budget-mb`）— 上限为 `1024` MB；在报告 `insufficientMemory` 的主机上池为 0 且自适应增长被禁用。增长按需进行，且不超过池允许的范围；当增长被拒绝、池耗尽或获得的余量不足以覆盖超出量时，最旧的条目会被整体丢弃（始终至少保留一个条目），因此保留的尾部可能远小于上限。固定此标志（或 `--max-journal-events`）会禁用自适应增长。必须是正安全整数。默认为 8 MiB。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--mcp-client-budget <n>`               | —                  | 活跃 MCP 客户端的正整数上限。当 `mcp_workspace_pool` 被公布时，上限和传输在每个工作区运行时中共享；当该标签不存在时，由旧版每会话管理器执行。结合 `--mcp-budget-mode` 使用。未设置时，不进行基于计数的执行（但 `GET /workspace/mcp` 仍会报告 `clientCount`）。不同于 claude-code 的 `MCP_SERVER_CONNECTION_BATCH_SIZE`（后者限制启动并发，而非总活跃客户端数）。预检 `caps.features.mcp_guardrails` 和 `caps.features.mcp_workspace_pool`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--mcp-budget-mode <m>`                 | `warn` / `off`     | `--mcp-client-budget` 的执行方式。`warn`（设置 budget 时的默认值）：不拒绝，当达到 budget 的 ≥75% 时，快照的 `budgets[0].status` 翻转为 `warning`。`enforce`：拒绝超过上限的连接，每个 server 的单元格显示 `disabledReason: 'budget'`，由 `mcpServers` 的声明顺序决定。`off`（未设置 budget 时的默认值）：纯可观测性。如果没有设置 budget，启动时会拒绝 `enforce`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--external-tool-guard-mode <m>`        | `off`              | 托管 ACP 的外部预执行策略。`off` 不进行提供程序调用也不公布 capability。`required` 除非兼容的提供程序完成 v1 握手否则启动失败，然后对每个受支持的顶级工具调用封闭式失败，除非其单个 prepare 请求被允许。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--external-tool-guard-endpoint <url>`  | —                  | 仅 origin 的环回 HTTP(S) 提供程序 URL，用于 `required` 模式，例如 `http://127.0.0.1:8787`。不接受路径、URL 凭据、重定向、非环回主机和代理路由。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--external-tool-guard-timeout-ms <n>`  | `3000`             | 整数 `100..30000`；分别应用于启动握手和每个 prepare 请求。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--http-bridge`                         | `true`             | 阶段 1 模式：生产模式会尝试预热一个主 `qwen --acp` 子进程以兼容并在失败后于首次使用时重试，而每个受信任的次要工作区可以按需启动一个子进程。targeting 运行时的会话通过 ACP `newSession()` 多路复用到其子进程上；不受信任的次要工作区无法启动 ACP。阶段 2 的原生进程内模式将在后续提供。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--initialize-timeout-ms <n>`           | `10000`            | ACP 子进程请求超时，包括 `initialize` 握手（毫秒）。必须是正整数，最大到 `2147483647`。高于 JS 计时器上限（`2^31-1`）的值在启动时被拒绝，因为 Node 会将其静默压缩为 1 毫秒。需要额外子进程启动余量的冷容器部署可以调高此值；同一个值还控制 `newSession`、工作区状态轮询和其他 ACP 扩展方法截止时间。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--session-restore-timeout-ms <n>`      | `60000`            | ACP 会话加载/恢复截止时间（毫秒）。必须是正整数，最大到 `2147483647`；`0` 无效。如果省略，默认值为 60 秒，当显式提供的 `--initialize-timeout-ms` 更大时会提升到该值；更短的初始化超时不会降低恢复预算。SDK 和 WebUI 会分别增加 10 秒和 15 秒的客户端余量。超时返回可重试的 `504 session_restore_timeout`；这并不意味着守护进程本身已退出。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--allow-origin <pat>`                  | —               | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。浏览器 webui 客户端的跨域白名单。可重复。每个值为 `*`（任意 origin —— 如果未配置 bearer token 则拒绝启动；建议在环回地址上使用 `--require-auth` 以进行完全加固，因为默认情况下 `/health` 在环回地址上是预认证的 — 注意 Web Shell 静态资源（`/`、`/assets/*`、`/session/:id` 文档导航）在任何模式下都在 bearer 之前挂载，即使在 `--require-auth` 下也保持预认证，所以当残留浏览器暴露面很重要时使用 `--no-web`）或规范的 URL origin（`<scheme>://<host>[:<port>]`，无尾部斜杠 / 路径 / 用户信息 / 查询参数）。**故意不支持子域名通配符（`https://*.example.com`）** —— 请显式列出每个子域名，或者使用 `*` 并配置 token（以及使用 `--require-auth` 进行完全加固）。匹配的 origin 会收到 CORS 响应头（`Access-Control-Allow-Origin`、`Vary: Origin`、methods、headers、max-age 以及暴露的 `Retry-After`）；不匹配的 origin 仍会收到 403，并带有与当前 wall 相同的信封。`Origin: null`（沙箱 iframe、file:// 文档）总是被拒绝，即使在 `*` 下也是如此。通过 `caps.features.allow_origin` 进行预检。环回地址自身的 origin 命中不受影响。 |
| `--web` / `--no-web`                    | `true`          | 在守护进程根目录提供构建好的 Web Shell SPA（`GET /`、`/assets/*` 以及 `GET /session/<id>` 文档导航）。这些入口点注册在 bearer 认证网关**之前** —— 浏览器无法将 token 附加到 `<script>` 子资源或地址栏导航，shell 不携带任何机密。每个 API 路由无论如何都受 token 保护，所有其他路径的 SPA 深度链接回退也位于 bearer 门控之后。在非环回地址绑定时，stderr 会输出一行警告，提示 UI 可在无认证的情况下访问。对于纯 API 守护进程，请使用 `--no-web`。当构建时省略了 Web Shell 资源时，此参数无效（守护进程会记录一条 breadcrumb 并以纯 API 模式运行）。                                                                                                                                                                                                                                                                                                          |
| `--open`                                | `false`         | 监听器启动后，在默认浏览器中打开守护进程 URL 处的 Web Shell（如果配置了 token，则会在 URL 片段中追加 `#token=` —— 片段永远不会发送到服务器，从而避免 token 出现在访问日志和 Referer 头中）。如果使用 `--no-web`，或者在没有浏览器的无头 / CI / SSH 环境中，则此操作无效。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--open-with-auth`                      | `false`         | 在环回地址上使用 bearer 身份验证打开 Web Shell。需要启用 Web Shell 和已构建的资源。重用已配置的 token 或生成进程生命周期的 256 位 bearer 并通过 Web Shell 片段传递。不支持浏览器的环境会打印包含机密的手动 URL。其他客户端需要相同的显式配置的共享 token。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

> **Memory project scope 注意事项。**
>
> - **守护进程 vs. 独立 CLI。** 该标志或守护进程启动环境为该守护进程拥有的每个运行时设置一个固定的作用域。工作区 `.env` 或 `settings.env` 无法为某个已注册的工作区覆盖它。独立 `qwen` TUI 仍然默认使用 git-root 作用域；要保持两个入口点一致，请在启动它们的 shell 或服务环境中导出 `QWEN_CODE_MEMORY_PROJECT_SCOPE`。
> - **目录名冲突。** 存储键由 `sanitizeCwd` 派生，它将每个非字母数字字符替换为 `-`。仅在标点上不同的兄弟目录（例如 `feature_1` 和 `feature-1`）即使在 `workspace` 作用域下也会映射到同一个内存目录。在依赖工作区隔离时请避免此类命名。
> - **标志和环境变量的规范化不同。** 环境变量会被修剪和小写化（`"  Workspace  "` 可以工作）；CLI 标志由 yargs `choices` 进行大小写敏感匹配（`--memory-project-scope Workspace` 会被拒绝）。在两者之间复制时使用小写值。

### 内置的守护进程 Git 重定位守卫

每个托管的守护进程 ACP 会话都会对模型 shell 命令应用内置的预执行守卫，独立于 `--external-tool-guard-mode`，且无需能力通告。守护进程拥有绑定的工作区和会话当前的有效工作目录；两者都来自受信任的会话状态，从不接受来自 ACP 子进程的值。

该守卫检查运行 shell 命令行的工具——`run_shell_command` 和 `monitor`——并在执行前拒绝仓库位置解析到会话有效工作目录之外的变更性 Git 命令。重定位的识别范围包括：`git -C <path>`、`git --git-dir[=]<path>`、`git --work-tree[=]<path>` 的字面形式，前导的 `GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR`/`GIT_INDEX_FILE` 赋值（包括通过 `export`/`declare`/`readonly` 进行的形式，这会使它们保留在链中后续每个命令的环境中），目录切换的 wrapper 标志（`env -C`、`sudo -D`），以及同一命令链中较早的 `cd`、`pushd` 或 `popd` 内置命令。常见的 wrapper 前缀（`sh -c`、`bash -c`、`eval`、`sudo`、`nohup`、`timeout`、`exec`、`command`、`builtin`、`env`、路径限定的 `git` 二进制文件，以及 `{ …; }` / `! …` shell 语法）会被解包，以便相同的策略应用于内部的 Git 调用，`$(…)` 或反引号替换体也会作为独立命令进行分析。

固定到自身 worktree 的子代理被限制在该 worktree 内，而非会话的目录；守护进程无法确定执行目录的 shell 调用会被拒绝。

相对目标在规范路径解析（包括 `.git` gitfile 重定向、符号链接和每 worktree 管理目录）后，从命令的有效起始目录（存在时为 `arguments.directory`，否则为会话当前的有效工作目录）解析。在无法完全解析的重定位目标上——动态目标（`$VAR`、反引号、`~`、glob）、尚不存在的路径或不可读的间接引用——对于变更性或不可分类的子命令会被拒绝。无法解析的重定位目标无论子命令是什么都会被拒绝——包括只读子命令。重定位命令的子命令属于经过验证的只读集合（`rev-parse`、`cat-file`）时，在目标可解析后仍然允许，除非命令携带了执行命令的 `-c` 配置，或携带了 `--output`、`--textconv` 或 `--filters` 标志：这些会写入文件或运行目标仓库配置的驱动程序。没有识别到重定位的命令保持其现有行为。拒绝是最终的，对于已解析、动态或不可解析的仓库位置，会向模型报告为 `Daemon shell guard denied a mutating Git command…`；当命令无法解析、其负载无法解析或不可识别的程序可能运行重定位的 Git 命令时，报告为 `Daemon shell guard denied a shell command…`。

该守卫对上述字面形式的 Git 重定位是可靠的——这正是此控制措施所针对的错误目标命令——但对旨在绕过它的 shell 文本是**尽力而为的，而非安全边界**：对静态读取器隐藏重定位的结构可能会通过，新的结构也会被不断发现。不要因此给予守护进程更广泛的信任。它不解释脚本文件，不跨命令跟踪环境变量的值，也不分析 heredoc 体（heredoc 中的 Git 形状文本即使 shell 从不执行也可以被拒绝）。`/fork` 和 agent 支持的 workspace memory remember/dream 在内置守卫下仍然可用；它们仅在下面的外部提供者模式激活时才受限。可选的外部工具守卫仍然是额外的策略，只有在内置策略允许后才接收相同的请求。

### 必需的外部工具守卫

此可选功能适用于需要在最终工具执行边界进行外部允许/拒绝决策的托管 ACP 部署。除非存在 `--external-tool-guard-mode=required`，否则它完全处于静默状态：

```sh
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

提供程序必须暴露 `POST /v1/handshake` 和 `POST /v1/prepare`，要求 `Authorization: Bearer <token>`，返回 JSON，回显提供的 nonce 或请求 ID，并使用协议版本 `1`。token 必须非空，最多 8192 个 UTF-16 代码单元，且不含控制字符。请求限制为 1 MiB，响应限制为 64 KiB，可选拒绝原因限制为 500 个 UTF-16 代码单元且不含控制字符。成功的 prepare 响应为：

```json
{ "protocolVersion": 1, "requestId": "<echo>", "allowed": true }
```

拒绝使用 `allowed:false` 并可以添加简短的 `reason`。对于每个通过现有权限和 `PreToolUse` 门控并到达最终执行边界的受支持顶级工具调用，Qwen Code 发送一个 prepare 请求且从不重试。更早的权限/hook 拒绝不会发送 prepare 请求。超时、取消、传输失败、格式错误或不匹配的响应以及显式拒绝都会阻止执行器运行。每个生成的 ACP 通道还必须确认它安装了必需的回调；缺失或不兼容的确认会在 Session 创建之前拒绝该通道。提供程序请求携带 `sessionId`、`promptId`、`toolCallId`、规范的 `toolName` 和最终 `arguments`；`toolCallId` 是关联标签，不是身份验证身份或独立的幂等键。

最终参数可能包含敏感的应用程序数据。在提供程序日志和审计存储中将其视为敏感数据。

`PreToolUse` hook 在此最终执行器决策之前运行。必需守卫模式不授权或沙箱化 hook 行为；需要在每个可能的副作用周围设置边界的部署必须禁用 hook 或单独管理其实现。

Slash command 操作也在模型/工具调度之前运行，不是守卫调用。一些内置命令可以直接更改文件或设置。需要全效果边界的托管部署必须通过 `slashCommands.disabled` 或 `--disabled-slash-commands` 拒绝 slash command 输入或禁用每个未批准的命令。

v1 托管作用域是由活跃前台托管 Prompt 调用的顶级工具。嵌套或委托的 `agent`、`workflow`、`create_sub_session`、`send_message`、直接 `/fork` 以及 agent 支持的工作区记忆 remember/dream 控制在必需模式活跃时会被拒绝。顶级后台 shell 或 monitor 启动仍然是一次受守卫的调用，其最终参数会到达提供程序，但此功能不会持续授权该进程或添加进程完成审计协议；需要前台完成的策略应拒绝这些形态。受守卫的 MCP 调用也会在传输错误后禁用自动重连/重放。成功启动握手后，`/capabilities` 会公布 `external_tool_guard`；其缺失意味着客户端不得假设已执行。

此功能不授权显式的守护进程 REST/ACP 管理调用；那些继续使用守护进程现有的身份验证和路由契约。它也不使已允许的工具或 shell 命令具有确定性或沙箱化其内部；托管部署必须将提供程序决策与其正常的工具策略和隔离边界结合使用。

> **调整负载参数。** `--max-sessions` 是每个工作区的新会话上限。`--max-total-sessions` 在设置时是守护进程级的新会话上限。另外三个层级也会限制负载——在为高并发部署调整大小时，请将它们一起调优：
>
> - **listener 层级**：`--max-connections` / `server.maxConnections=256` 限制原始 TCP 连接数（慢速客户端背压）。
> - **每个 session 的 subscriber**：EventBus 默认将每个 session 的 SSE subscriber 上限设为 64；第 65 个客户端会收到终端 `stream_error` 并被关闭。
> - **每个 session 的 prompt 准入**：`--max-pending-prompts-per-session=5` 限制单个 session 接受的排队 + 活跃 prompt 数量。溢出会返回 `503` 及 `Retry-After: 5`。
> - **守护进程级的新会话**：`--max-total-sessions=N` 限制跨守护进程的新会话创建。溢出会得到相同的 `session_limit_exceeded` 形态，带有 `scope: "total"`。
> - **每个 subscriber 的 backlog**：每个 SSE 客户端 256 个 frame 的队列；超容量的客户端会收到终端 `client_evicted` frame 并被关闭（一个慢速消费者无法拖垮 daemon）。
>
> 这些上限会相互影响：每个运行时受 `--max-sessions` 限制，而 `--max-total-sessions` 限制其聚合。有效会话上限是任何有限守护进程级上限和聚合每运行时上限中的较低者（如果每工作区上限无限制，则将该聚合视为无限制）。如果两者都不是有限的，则没有有限会话上限。有限上限 × 64 个 subscriber × 256 个 frame 是 EventBus 层最坏情况下的内存中占用，再乘以 `--max-pending-prompts-per-session` 限制准入层接受的 prompt 工作量。默认大小假设是单用户/小团队负载；对于更大的部署，请逐步提高（并观察 RSS）。

> **MCP client 防护栏（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** 如果在 `mcpServers` 中声明了 30 个 MCP server，workspace 将启动 30 个 client，除非你设置了上限，否则没有上游限制。`--mcp-client-budget=N` 限制活跃的 MCP client 数量；`--mcp-budget-mode={enforce,warn,off}` 选择行为模式。设置 budget 时默认为 `warn`（快照会显示警告，但不会拒绝任何 client——在开启强制执行之前，这对于测量实际扇出很有用）。在 `enforce` 模式下被拒绝的 server 会在其 per-server cell 中获得 `disabledReason: 'budget'`，并且 `budgets[0]` cell 会显示 `status: 'error'` + `errorKind: 'budget_exhausted'`。Slot 预留按 server 名称进行，并在重连/发现超时后保留——被拒绝的 server 无法从健康的 server 那里抢占 slot。
>
> **当前作用域是基于 capability 的。** 当 `mcp_workspace_pool` 存在时，一个工作区运行时中的所有会话共享其 MCP 传输池和预算控制器；`GET /workspace/mcp` 发出 `scope: 'workspace'`。第二个工作区有独立的池和预算。当该标签不存在时（包括 `QWEN_SERVE_NO_MCP_POOL=1`），守护进程使用旧版每会话 `McpClientManager` 并发出 `scope: 'session'`；在该回退中，N 个会话可以各自消耗配置的上限。
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # 稍后，当 telemetry 显示你的实际分布后：
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> 这与 claude-code 的 `MCP_SERVER_CONNECTION_BATCH_SIZE`（控制启动并发）**不**是一回事；它们是正交的。客户端必须基于 `mcp_workspace_pool` 进行分支，而不是仅从协议版本假设作用域。
>
> **Push events（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）。** 订阅了 `GET /session/:id/events` 的 SDK client 会在 budget 阈值被跨越时收到类型化的 frame——`mcp_budget_warning`（合成的，每次向上跨越 75% 时触发一次，并在 37.5% 时通过滞后重新武装，通过 `mcp_guardrail_events` 广播）和 `mcp_child_refused_batch`（在 `enforce` 模式下的每次发现过程中合并一次；来自 `readResource` 延迟生成拒绝的长度为 1 的 batch）。`GET /workspace/mcp` 处的快照仍然是重连后状态的 single source of truth；events 是变化边缘。在无需轮询的情况下实时构建 dashboard 时非常有用。

## 默认部署威胁模型

- **仅限 127.0.0.1** —— loopback 绑定，无需 auth。
- **`--hostname 0.0.0.0` 需要 token** —— 启动时如果没有 token 会拒绝。
- **`LOOPBACK_BINDS` 包含 IPv6** —— `::1` 和 `[::1]` 在无 token 规则下被视为 loopback。
- **Host header 白名单** —— 在 **loopback** 绑定上，daemon 会检查 `Host:` 是否匹配 `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port`（根据 RFC 7230 §5.4 不区分大小写）以防御 DNS rebinding。**非 loopback 绑定（`--hostname 0.0.0.0`）故意绕过 Host 白名单** —— 运维人员已经选择了暴露面，因此 bearer-token 网关是唯一的身份验证层；反向代理 / SNI / client cert pinning 是运维人员的责任，而不是 daemon 的责任。如果你需要在非 loopback 绑定上实现基于 Host 的隔离，请在前端代理处终止 TLS 并检查 Host。
- **CORS 默认拒绝任何浏览器 Origin** —— 返回 `403` JSON。传递 **`--allow-origin <pattern>`**（可重复，T2.4 #4514）以允许特定的浏览器 origin。每个值要么是字面量 `*`（任何 origin——如果未配置 bearer token，启动时会拒绝；建议在环回地址上使用 `--require-auth` 以进行完全加固，因为默认情况下 `/health` 在环回地址上是预认证的 — 注意 Web Shell 静态资源（`/`、`/assets/*`、`/session/:id` 文档导航）在任何模式下都在 bearer 之前挂载，即使在 `--require-auth` 下也保持预认证，所以当残留浏览器暴露面很重要时使用 `--no-web`），要么是规范的 URL origin（`<scheme>://<host>[:<port>]`，无尾随斜杠/路径/userinfo）。匹配的 origin 会收到正确的 CORS 响应头（`Access-Control-Allow-Origin: <echoed>`、`Vary: Origin`，以及标准的 methods / headers / max-age 和暴露的 `Retry-After`）；不匹配的 origin 仍会收到 403，并使用与默认墙相同的 envelope。`caps.features.allow_origin` 是有条件广播的，因此 SDK / webui client 可以在发出跨域请求之前预检 daemon 是否支持。示例：`qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`。Loopback 自身 origin 的请求不受影响——一个单独的 Origin 剥离 shim 会处理它们，无论 `--allow-origin` 如何配置。**未配置 `--allow-origin` 的浏览器 webui** 仍会回退到与之前相同的 Stage 1 选项：打包为原生 shell（Electron/Tauri）以便不发送 `Origin` header，或者在 daemon 前面放置一个同源的反向代理。
- **Chrome 扩展浏览器自动化与 framing 是分开的。** `qwen serve --allow-origin chrome-extension://<id>` 允许扩展 frame Web Shell 并连接到守护进程。Console/network/screenshot/click 工具需要外部 CDP MCP 适配器命令：`QWEN_CDP_MCP_COMMAND=/path/to/cdp-mcp-adapter qwen serve --allow-origin chrome-extension://<id>`。主 CLI 包不包含浏览器自动化适配器；客户端可以在展示这些工具为可用之前检查 `caps.features.includes('browser_automation_mcp')`。
- **生成的 `qwen --acp` 子进程接收其所属运行时的有效环境。** 守护进程冻结 process-env 基础，将该工作区的 settings/env-file 覆盖应用到运行时本地快照，且永远不会将覆盖写回 `process.env`；另一个运行时中同名的键不会跨越。`QWEN_SERVER_TOKEN` 在生成前被清除，因为 agent 不需要守护进程 bearer。影响加载器的变量（`NODE_OPTIONS`、`npm_config_node_options` 和 npm 的配置文件重定向、`NODE_PATH`、`OPENSSL_CONF`、`NODE_REPL_EXTERNAL_MODULE`、`npm_config_node_gyp`、`npm_config_init_module`、`LD_PRELOAD`、`LD_AUDIT`、`DYLD_INSERT_LIBRARIES`、`BASH_ENV`、`ZDOTDIR`、导出的 bash 函数定义 `BASH_FUNC_*`）同样永远不会传递给会话子进程 — 守护进程从自己的 `process.env` 和会话托管子进程生成的冻结基础环境中清除它们（基础环境仅在 `DEV=true` 工具链下保留它们，其 `.ts` 入口仍需要 tsx 加载器），且 `.env` / `settings.json` `env` 源拒绝它们（参见 [settings](./configuration/settings.md)）；这适用于守护进程托管的每个会话。基础凭据如 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`QWEN_*` 和 `DASHSCOPE_API_KEY` 否则直接传递，除非运行时覆盖更改它们。**这是有意的，不是沙箱。** agent 以相同的 UID 运行并具有 shell 工具访问权限，因此 `~/.bashrc`、`~/.aws/credentials` 或 `~/.npmrc` 中的任何内容无论如何都可以通过 prompt 注入到达。运行时之间的环境隔离不是操作系统安全边界；不要在拥有你不会信任 agent 的凭据的身份下运行 `qwen serve`。
- **Agent 文本读取是子进程本地的，遵循常规 CLI 权限规则，而不是工作区文件系统边界。** 直接的 `read_file` 可以到达每个已注册工作区之外的主机文本路径：外部路径默认为确认，允许规则或审批模式可能会自动批准它们。批准的读取使用可配置的 CLI 输出限制，而不是工作区文件系统的返回输出、完整快照和大文本扫描上限。这适用于每个共享文本读取消费者，因此 write、edit、notebook、sed 和 artifact 操作执行的预读取会失去这些上限以及工作区文件系统的读取审计、符号链接拒绝和读取端 TOCTOU 保护 — 确切列表请参阅[设计文档](../design/daemon-local-text-reads.md)。由于确认有效负载是通过读取文件构建的，工作区外的 diff 会在任何人批准之前分发给**每个**附加的 SSE 订阅者 — 在交互式 CLI 中，该内容仅由终端前的人看到。将已认证的守护进程客户端视为相同的安全主体。HTTP 文件系统路由仍保持工作区作用域，agent 发现工具行为不变。
- **内置文本工具的已批准最终写入具有窄小的同主机路由。** `write_file`、`edit`、`notebook_edit` 和 shell 工具的模拟 sed 编辑器仅在现有权限策略允许执行后才附加内部来源。因此，它们的最终 ACP 文本写入可以 targeting 拥有工作区之外的绝对路径，而无需二次确认；允许规则、AUTO/AUTO_EDIT 和 YOLO 的行为与 CLI 相同，而拒绝、Plan、Hook/Guard 拒绝和预执行取消不会发送最终写入。工具已进入不可取消的文件系统操作后的取消保留该工具的现有行为。工作区目标仍使用 WFS。外部目标使用守护进程宿主写入器，具有相同的信任快照、5 MiB 编码限制、叶子符号链接拒绝、规范路径锁定、原子重命名、模式保留、默认 `0600` 新文件模式（可配置 — 参见 [Agent 文本写入的新文件权限模式](#agent-文本写入的新文件权限模式)）、generation guard 和文件系统审计。HTTP 写入、通用或未标记的 ACP 写入、注入的 bridge/workspace-registry/factory 集成和任意 shell 重定向不接收此例外。请参阅[外部写入设计](../design/daemon-external-tool-text-writes.md)。
- **每个订阅者有界的 SSE 队列** — 溢出队列的慢速客户端会收到 `client_evicted` 终止帧并被关闭；一个卡住的消费者无法拖累守护进程。
- **每会话 prompt 准入上限** — 默认为每个会话 5 个已接受但未处理的 prompt。有缺陷的客户端无法为一个会话排队无限制的 prompt promise 或临时 SSE 等待。
- **优雅关闭** — SIGINT/SIGTERM 在关闭监听器之前 drain agent 子进程（每个子进程 10 秒截止时间）。

> ⚠️ **阶段 1 已知差距 — 权限是守护进程全局的，而非每会话的（BUy4H）。** `pendingPermissions` 存在于守护进程作用域；持有 bearer token 的任何客户端可以对其能看到的任何会话的任何 `requestId` 进行投票（并且 SSE `permission_request` 事件在其 payload 中携带 requestId）。这在单用户/小团队信任模型下是可以接受的，其中每个已认证的客户端是同一个人或其信任的协作者。阶段 1.5 将迁移到 `POST /session/:id/permission/:requestId` + 会话级待处理映射 + 每客户端身份（来自下游审查的 must-have #3）；在此之前，不要在与不受信任方共享的 bearer 后运行 `qwen serve`。
>
> ⚠️ **阶段 1 已知差距 — `POST /session/:id/prompt` body 上限为 10 MB（BUy4L）。** 包含图片/PDF/音频且超过 10 MB 的多模态 prompt 将在路由逻辑运行之前在 body 解析时失败（无流式传输，无中途上传中止）。解决方法：在客户端缩小内容，或传递路径引用并让 agent 通过 `readTextFile` 读取文件。阶段 1.5 将在 `/prompt` 上接受 `multipart/form-data` 或分块编码，以便大型 prompt 不会遇到硬性限制。
>
> ⚠️ **阶段 1 已知差距 — NAT 后的幽灵 SSE 连接。** 守护进程通过心跳（15 秒间隔）上的 TCP 背压检测死客户端。在没有 TCP RST 的情况下消失的客户端（例如静默丢弃空闲流的 NAT 盒子）会保持内核级套接字"存活"，直到 Node 的 keepalive 探测超时 — 在 Linux 默认值下通常为 ~2 小时。在此类 NAT 后的 `--hostname 0.0.0.0` 部署上，幽灵 SSE 连接可能会累积并最终达到 256 的 `server.maxConnections` 上限。
>
> 设置 [`--writer-idle-timeout-ms <n>`](#截止时间与-writer-空闲超时)（issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9）以显式的应用级空闲截止时间来弥补此差距：当在 `n` 毫秒内没有成功刷新写入时，守护进程会发出 `reason: 'writer_idle_timeout'` 的终止 `client_evicted` 帧并关闭流。该标志默认关闭以保持遗留契约 — 在吞噬 RST 的网络上的运维人员应选择远高于 15 秒心跳间隔的值（例如 `60000`–`300000`），以便合法的空闲连接不会被驱逐，而真正卡住的写入器会被及时回收。从你的 SDK 中预检 `caps.features.includes('writer_idle_timeout')` 以确认守护进程支持它。

### 截止时间与 writer 空闲超时

Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 提供了两个可选标志，弥补 15 秒心跳 + AbortSignal 未覆盖的长时间运行/远程部署差距。两者默认关闭 — 单用户环回工作流保持逐位不变。

| 标志                           | 环境变量                             | 默认值 | 功能                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | 未设置   | 单个 `POST /session/:id/prompt` 的服务端挂钟上限。到期时守护进程中止 prompt 的 AbortController 并返回 HTTP `504`，body 为 `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`。每 prompt 请求 body 字段 `deadlineMs` 可以**缩短**有效截止时间到标志值以下，但不能延长它。Capability 标签（有条件的）：`prompt_absolute_deadline`。                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | 未设置   | 每 SSE 连接的空闲截止时间。当在 `n` 毫秒内没有**成功**刷新写入时 — 既没有真实事件也没有 15 秒心跳 — 守护进程发出 `data.reason = 'writer_idle_timeout'`（在 `data.errorKind` 上镜像）的终止 `client_evicted` 帧并关闭流。**选择远高于 15 秒心跳的值**（例如 `30000`–`300000`），以免合法的空闲流被驱逐；值 `< 15000` **会**在第一次心跳触发之前驱逐 otherwise-healthy 的空闲连接（仅用于测试/短生命周期开发会话）。Capability 标签（有条件的）：`writer_idle_timeout`。 |
| `--permission-response-timeout-ms <n>` | —                                   | `0`     | 守护进程模式下普通权限和 `ask_user_question` 响应的共享挂钟时间。`0` 或省略该标志会无限等待；正整数对两者都施加截止时间。投票者取消、会话取消和守护进程关闭仍然会在计时器禁用时解析待处理的交互。                                                                                                                                                                                                                                                                                                            |

prompt 和 writer 标志都接受毫秒为单位的正整数；`0`、`NaN`、非整数或负值在启动时被拒绝，并带有清晰的错误消息。权限响应超时接受 `0` 或正整数。对于两个环境支持的截止时间，显式 `ServeOptions` 字段优先于环境变量。SDK 消费者应在依赖 prompt 和 writer 行为之前预检匹配的 capability 标签。

### Agent 文本写入的新文件权限模式

Agent 文本写入（`write_file`、`edit`、`notebook_edit` 以及 shell 工具的模拟 sed 编辑器）通过守护进程的原子写入器发布，它会保留现有目标的权限模式，而对于**新**文件，默认使用仅限所有者的 `0600`，忽略守护进程进程的 umask。这种 fail closed 的默认值是有意为之的：无论主管 umask 多么宽松，新创建的 agent 文件都不会意外地对组/其他用户可读。

部署约定基于 umask 的运维人员（例如带有 `UMask=0002` 的 systemd 单元、共享组仓库）可以通过以下方式让新文件使用标准 POSIX 处理：

| 环境变量                   | 值                | 默认值  | 功能                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ----------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_NEW_FILE_MODE` | `owner` \| `system` | `owner` | `system` 以 `0o666 & ~umask` 创建新文件，因此 agent 创建的文件会像机器上的其他进程一样跟随守护进程进程的 umask。`owner` 保持不受 umask 影响的 `0600` 默认值。值不区分大小写；字面值 `0600` 作为 `owner` 的别名被接受（不支持其他八进制模式），任何其他值都会被拒绝，并在 stderr 输出警告后保持 `0600` 默认值。 |

范围和限制：

- 适用于文本写入路由创建的新文件（工作区目标、同主机外部宿主写入器和 HTTP 文本写入）。现有文件始终保留其磁盘上的权限模式 — 编辑 `0600` 的密钥文件仍保持 `0600`，可执行文件保持 `+x`。
- 二进制上传（`POST /file/upload`）无论此设置如何，始终以 `0600` 创建。
- 守护进程在工作区文件系统构建时读取该变量；更改后请重启守护进程。

## 多会话和多工作区部署

重复 `--workspace` 可在一个 `qwen serve` 进程中注册多个不重叠的工作区。第一个路径为主工作区。每个已注册的工作区拥有一个隔离的运行时边界，而守护进程级的监听器、身份验证策略和总会话上限是共享的。生产模式会尝试预热主 ACP 子进程以兼容并在失败后于首次使用时重试；受信任的次要工作区按需启动自己的子进程，而不受信任的次要工作区不会启动 ACP。请求可以通过规范的 `cwd` 选择已注册的工作区；省略 `cwd` 的请求使用主工作区。每个用户或安全主体使用一个守护进程；工作区信任是执行门控，不是 ACL。

不受信任的次要工作区在 Web Shell 中显示为 `untrusted` 和 `read-only`。它可以展开以查看持久化会话目录，但目前无法在 Web Shell 中选择或打开、恢复、用于创建会话或完整导出。REST API 遵循现有的有界文件系统读取策略，还暴露其持久化会话组目录，以及当 `workspace_persisted_transcript` 被公布时，通过有界的工作区限定分页器暴露其活跃持久化转录。这些读取不包含实时运行时状态，也不会启动 ACP 子进程。完整的工作区限定导出需要受信任的工作区和单独的 `workspace_session_export` capability。在使用执行、变更或导出功能之前，请先信任该工作区并重启守护进程。不受信任的主工作区在 Web Shell 中保持禁用状态。

当你需要更小的故障或安全边界、独立的 bearer token、配额、审计边界、操作系统隔离或独立的资源监督时，请使用独立的守护进程。多工作区模式适用于一个运维人员托管多个仓库；它不是多租户隔离边界。单个守护进程 token 授权守护进程暴露的每个路由，包括所有已注册工作区的允许只读目录。

> **在附加时提交 `modelServiceId` 之前先订阅。** 当客户端 `POST /session` 带有 `modelServiceId` 且工作区已有一个运行不同模型的会话时，守护进程会发出内部 `setSessionModel` 调用 — 失败**不会**作为 HTTP 错误传播（会话在其当前模型上保持运行）。可见的失败信号是会话 SSE 流上的 `model_switch_failed` 事件。如果你先调用 `POST /session` 然后才打开 `GET /session/:id/events`，你会错过失败事件并继续与错误的模型对话。先打开 SSE 流，或在订阅时传递 `Last-Event-ID: 0` 以重放环中最旧的可用事件。

要处理多个**用户或安全主体**（每个都有独立的 token、配额、审计日志、沙箱或进程故障边界），或者要扩展超出单个进程的范围（冷启动预算、FD 数量、RSS），请在外部编排器后面为每个主体生成一个守护进程。每个这样的守护进程仍然可以为该主体托管多个工作区。编排器（多租户 / OIDC / 配额 / 审计 / k8s）**不在** qwen-code 项目的范围内 — 请参阅 issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" 获取设计指引。

## 加载和恢复持久化会话

守护进程通过 HTTP 暴露 ACP 的 `session/load` 和恢复流程，以及一个独立的只读转录分页器：

| 路由                                                    | 使用时机                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /session/:id/load`                                | 客户端**没有**有用的本地历史渲染（冷重连、先选择再打开）。对于活跃会话，守护进程返回并注入当前的有界重放快照窗口；如果较旧的重放已被丢弃，快照以 `history_truncated` 开头。Capability 标签：`session_load`。                                                                                       |
| `POST /session/:id/resume`                              | 客户端已经在屏幕上显示了 turn，只需要守护进程端的句柄。模型上下文在代理端恢复，无需 UI 重放 — SSE 流保持干净。Capability 标签：`session_resume`（`unstable_session_resume` 仍然是旧版客户端的弃用别名）。                                                                                             |
| `GET /session/:id/transcript`                           | 客户端需要完整的活跃持久化转录。它以游标分页返回无 id 的重放帧，不调用 `/load`、不附加客户端、不植入实时 EventBus、不创建活跃会话，也不更改实时重放窗口。Capability 标签：`session_transcript`。                                                                                                   |
| `GET /workspaces/:workspace/session/:id/transcript`     | 客户端需要从选定工作区获取活跃持久化转录，而不启动 ACP 或加载工作区设置。已注册的不受信任次要工作区可以使用此只读路径。Capability 标签：`workspace_persisted_transcript`。                                                                                                                          |
| `GET /workspaces/:workspace/session/:id/export`         | 客户端需要从选定的受信任工作区获取完整的 `html`、`md`、`json` 或 `jsonl` 附件。它读取活跃持久化存储而不启动 ACP 或回退到主工作区。Capability 标签：`workspace_session_export`。                                                                                                                     |
| `GET /workspaces/:workspace/session/:id/archive/export` | 客户端需要从选定的受信任工作区中已归档的持久化存储获取相同的附件格式。它不会取消归档、启动 ACP 或回退到活跃或主会话。Capability 标签：`workspace_archived_session_export`。                                                                                                                          |

对于 load 和 resume，TypeScript SDK 在 `DaemonSessionClient` 上暴露静态工厂方法：

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// 冷重连 — 守护进程将通过 SSE 重放有界的快照窗口。
const session = await DaemonSessionClient.load(client, 'persisted-id');

// 或者，如果你的 UI 已经有历史记录，跳过重放：
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // 首先是重放的 `session_update` 帧（仅 load），
  // 然后是实时事件。
}
```

在调用匹配路由之前预检 `caps.features.session_load`、`caps.features.session_resume` 或 `caps.features.session_transcript` — 旧版守护进程返回 `404`。`unstable_session_resume` 仍然作为弃用的兼容性别名被公布。同一 id 的并发同操作请求会合并；跨操作竞争（`load` 和 `resume` 竞争）以及调用方提供的 id 生成与恢复竞争会得到 `409 restore_in_progress` 和 `Retry-After: 5`。超过 `limits.sessionRestoreTimeoutMs` 的恢复会得到可重试的 `504 session_restore_timeout`，并带有根据预算派生的 `Retry-After`（限制在 5-120 秒）；仍在运行的子进程请求在清理解决之前保持隔离，该窗口内同一 id 的重试会得到 `409 restore_in_progress`，`reason: awaiting_abandoned_cleanup`，以及根据预算派生的 `Retry-After`（限制在 5-120 秒），而非固定的 5 秒延迟。如果清理不确定，或者被放弃的恢复在截止时间后仍未解决完整的恢复预算，新会话工作会临时得到 `503 acp_channel_unavailable`，`reason: restore_cleanup_failed` 或 `restore_settlement_overdue`，而已活跃的会话仍可使用。完整错误信封请参阅[协议参考](../developers/qwen-serve-protocol.md)。

对于完整的持久化重放，请使用 `DaemonClient.getSessionTranscriptPage(sessionId, { cursor, limit })` 或原始 REST 路由进行分页：

```bash
curl "http://127.0.0.1:4170/session/$SESSION_ID/transcript?limit=100"
```

对于已注册的工作区，请使用 `client.workspaceById(workspaceId).getSessionTranscriptPage(sessionId, { cursor, limit })` 或 `/workspaces/:workspace/session/:id/transcript`。工作区限定方法始终使用原生 REST，即使 SDK 客户端有可替换的 ACP 传输。其游标仅限守护进程生命周期，守护进程重启后必须从第一页重新开始。

对于来自受信任已注册工作区的完整附件，请预检 `workspace_session_export` 并调用 `client.workspaceById(workspaceId).exportSession(sessionId, { format: 'html' })` 或原始 `/workspaces/:workspace/session/:id/export` 路由。不要从 `session_export` 或 `workspace_qualified_rest_core` 推断支持：旧版守护进程可能同时公布两者但仍保留仅主工作区导出。当前的 Web Shell 导出操作仍然是仅主工作区的；请使用 SDK 或 REST 路由来导出其他工作区。

对于已归档的附件，请预检 `workspace_archived_session_export` 并调用 `client.workspaceById(workspaceId).exportArchivedSession(sessionId, { format: 'html' })` 或 `/workspaces/:workspace/session/:id/archive/export`。此路径就地读取已归档的存储，对于仅活跃的 id 返回 `409 session_not_archived`；它不会取消归档会话。当 capability 存在时，Web Shell 为受信任的主工作区和次要工作区中的已归档行暴露相同的导出。

`limit` 计算的是活跃聊天记录数，而不是发出的重放帧数；一条记录可以产生多个 `session_update` 事件。第一个响应冻结 JSONL 快照大小，并在 `hasMore` 为 true 时返回 `nextCursor`。后续页面忽略第 1 页之后的追加，但如果文件被删除、截断、替换、归档或以其他方式与冻结的游标冲突，则返回 `409`。非常大的快照会在索引之前返回 `413 transcript_too_large`，以便守护进程不会在请求路径上扫描无限制的转录文件。

对于通过旧版单数路由的重复分页，请将 `--channel-idle-timeout-ms` 设置为正值。在默认的 `0` 下，空闲工作区的 ACP 子进程 — 以及它持有的进程内转录索引缓存 — 会在每页之后被回收，因此每页都会重新生成子进程并通过重新扫描整个冻结前缀来重建索引（每页 `O(snapshotSize)`）。正值超时会在游标遍历期间保持子进程活跃，以便它重用缓存的转录索引和重放配置。工作区限定的持久化路由永远不会启动 ACP 子进程，不受此超时的影响。

注意：实时会话历史重放有双重限制：`Last-Event-ID` 重连受 SSE 环限制，`POST /session/:id/load` 返回的快照受 `--compacted-replay-max-bytes` 限制。具有大量对话轮次的长历史可能超过任一限制。守护进程通过 `history_truncated` 暴露快照截断；当你需要完整的活跃持久化历史时请使用 `/transcript`。

## 持久化模型

**在阶段 1 中，会话在守护进程重启间仍然是临时的**，但磁盘上的持久化会话可以重新加载：

- 子进程崩溃会发布 `session_died` 并从守护进程的映射中移除活跃会话。如果可以生成新的 agent 子进程，持久化的磁盘上会话**可以**通过 `POST /session/:id/load` 重新加载。
- 守护进程重启会丢失所有进行中的活跃会话。持久化的会话保留在磁盘上，可以针对新的守护进程进程加载，遵循相同的工作区绑定规则。
- 长时间客户端断开（在大量对话轮次中 >5 分钟）可能超过 SSE 重放环（默认 8000 帧）— `Last-Event-ID` 重连触发 `state_resync_required`。对于移动端/网络不稳定的客户端，计划在长时间断开时重新打开 SSE 或调用 `POST /session/:id/load` 来恢复当前的有界重放快照；不要假设该路由返回完整转录。
- 文件操作（`writeTextFile`）在崩溃间是原子的（先写后重命名）；它们在守护进程重启间不是原子的（就重放而言）— 文件写入要么成功了，要么没有。

如果你的集成需要超出 `session/load` 覆盖范围的服务端跨重启持久性（例如服务器管理的重试队列），你仍然需要应用级状态恢复。不要在守护进程的会话中持有长时间运行的、重启敏感的状态。

## 阶段 1.5+ 运行时保障

阶段 1 的合约面向原型开发。根据 [#3889 chiga0 downstream-consumer review](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644)，以下内容**不在**阶段 1 中 —— 生产级集成需要阶段 1.5+ 后才能依赖它们：

**严重下游使用的阻塞项：**

1. **`loadSession` / `unstable_resumeSession` over HTTP** —— 没有此功能，任何集成都无法在子进程崩溃或守护进程重启后存活，任何协调守护进程的编排器也无法恢复状态。
2. **持久化客户端身份（pair token + 每客户端撤销）** —— 阶段 1 使用一个共享的 bearer；泄露的 token 会撤销所有人，`originatorClientId` 是客户端自声明的，而不是守护进程从已认证身份中盖章的。

**可靠性基线：**

3. ~~**客户端发起的心跳路径**~~ —— 已通过 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 9 发布。`POST /session/:id/heartbeat` 在守护进程上记录最后可见时间戳（capability 标签 `client_heartbeat`）；SDK 辅助方法为 `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`。
4. 当投票在首个响应者竞争中落败时发出 **`permission_already_resolved` 事件** —— 目前 UI 必须从 `404` 推断状态。
5. ~~**更大的重放环**~~ —— 已提升到 8000。**每会话可配置环**仍然开放 —— 移动端/多对话轮次工作负载可能需要每会话覆盖。
6. 在 `client_evicted` 之前发出 **`slow_client_warning` 事件** —— 软背压，使行为良好的慢速客户端可以在被终止前自行节流（减少渲染深度、丢弃块）。

**集成人体工程学：**

7. **`POST /session/:id/_meta` 用于 IM 风格的上下文** —— 附加到后续 prompt 的每会话键值对（聊天 id、发送者、线程 id），取代每通道的临时方案。
8. **`/capabilities` 实际特性协商** —— `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }`，以便客户端能够检测到偏差，而不是直接回退到"未知帧，忽略"。
9. **一等公民的持久化文档**（本节） —— 已在上方发布。

完整的融合路线图在 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) 中跟踪。

## 第一阶段范围边界 —— 我们在阶段 1.5 中不会修复的问题

有两个结构性选择被明确列为阶段 1 / 1.5 / 2 主线路线图的非目标。如果你的用例依赖于其中任何一个，请围绕它们进行规划，而不是等待我们。

### 会话状态仅限本地修改（根据 [LaZzyMan review #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721)）

阶段 1.5 计划将 TUI 描述为进程内 EventBus 订阅者。实际上，**TUI UI 严格大于线路协议（wire protocol）**：

- **仅限本地的 UI** —— 约 15 个 Ink 对话框组件（`ModelDialog`、`MemoryDialog`、`PermissionsDialog`、`SessionPicker`、`WelcomeBackDialog`、`FolderTrustDialog` 等）以及 `local-jsx` 斜杠命令（`/ide`、`/auth`、`/init`、`/resume`、`/rename`、`/delete`、`/language`、`/arena` 等）渲染特定于终端的 Ink JSX。通过 HTTP/SSE 连接的远程客户端无法等效渲染 Ink，且这些流程不会发出线路事件。
- **没有线路事件的会话状态修改** —— `/approval-mode`、`/memory add`、`/mcp add-server`、`/agents`、`/tools enable/disable`、`/auth`、`/init`（写入 `CLAUDE.md`）都会改变代理行为，但目前只有 `/model` 会发布事件（`model_switched`）。

**阶段 1 的选择 —— 评审中的选项 (A)**：不将这些修改提升为线路事件。这两种部署模式会产生不同的后果。

#### 模式 1 —— 无头 `qwen serve`（本 PR）

守护进程内部没有运行 TUI shell。上述列出的斜杠命令在此模式下**不存在** —— 因为没有终端 UI 来发出它们。因此，会话状态是：

- **启动时冻结** 的 `approval-mode` / `memory` / `agents` / `tools` 允许列表 / `auth` —— 当守护进程的 `qwen --acp` 子进程启动时，全部从设置和磁盘加载；在会话生命周期内不可变。设置中定义的 MCP 服务器同样在启动时冻结，但**运行时添加的服务器**（通过 `POST /workspace/mcp/servers`）可以在不重启的情况下添加或删除。
- **可通过 HTTP 修改**，通过 `POST /session/:id/model`（发布 `model_switched`）、`POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name`（发布 `mcp_server_added` / `mcp_server_removed`），以及权限投票（`POST /permission/:requestId`）。

**后果：** 无头模式下的远程客户端可以看到**完整的会话状态**。没有 TUI 隐藏额外状态；不可能出现状态漂移。如果你想更改 `approval-mode`，请使用新设置重启守护进程。MCP 服务器现在可以通过修改路由（`POST /workspace/mcp/servers`、`DELETE /workspace/mcp/servers/:name`）在运行时添加/删除 —— 请参阅[运行时 MCP 服务器管理](#runtime-mcp-server-management-issue-4514)。

#### 模式 2 —— 阶段 1.5 `qwen --serve` 协同托管 TUI（不在本 PR 中）

当阶段 1.5 落地 `qwen --serve`（TUI 进程协同托管同一个 HTTP 服务器）时，TUI **确实**与远程客户端并存。本地操作员输入 `/approval-mode yolo` 或 `/mcp add-server` 会修改会话状态，而 HTTP 上的远程客户端没有事件可以观察到此更改。

在此模式下，TUI 是一个 **"超级客户端"** —— 它观察远程客户端看到的相同代理对话，并且可以修改远程客户端无法修改的会话状态。这种不对称性体现在：

- ✅ TUI 和远程客户端都能看到相同的代理消息、工具调用、文件差异和权限提示。
- ❌ 只有 TUI 能看到/修改 approval-mode / memory / MCP 服务器列表 / agents / tools 允许列表 / auth 状态。

**模式 2 的后果：** 如果远程客户端 UI 尝试镜像会话设置，它在任何 TUI 斜杠命令后都可能出现状态漂移。远程客户端应在**附加/重新连接时重新获取状态**（使用 `Last-Event-ID: 0` 重放环中最旧的事件，例如 `model_switched`）；它们**不应**依赖增量事件来处理 TUI 端的修改。

#### 为什么选择 (A) 而不是 (B)（将修改提升为 `session_state_changed` 事件族）

(B) 是更具野心的答案，但会将阶段 1.5 锁定在一个大得多的线路表面上，且该表面还必须干净地通过计划中的进程内重构。我们宁愿诚实地走较小的范围。会话状态事件分类工作 —— 列举哪些 TUI 流程在设计上仅限本地，哪些可以在未来选择加入的 (B) 风格扩展中合理地升级为线路事件 —— 将移至 [#3803](https://github.com/QwenLM/qwen-code/issues/3803)，而不是阶段 1.5 代码中。

### 每个工作区运行时 N 个并行会话共享一个 `qwen --acp` 子进程

同一受信任工作区上的多个会话通过代理的原生多会话支持（`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`）**共享该运行时的 `qwen --acp` 子进程**。桥接器为每个会话调用 `connection.newSession({cwd, mcpServers})` —— 代理将它们存储在其会话映射中，并按调用解复用 sessionId。生产模式最多可以拥有一个主子进程（默认尝试预热）加上每个受信任次要工作区一个按需子进程；不受信任的次要工作区不拥有任何子进程。

在同一工作区上 N=5 个会话的具体开销：

| 资源                             | 每会话                                                | N=5 时                                                             |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------ |
| Daemon Node 进程                  | 一个                                                   | **30–50 MB**（一个守护进程）                                         |
| `qwen --acp` 子进程                   | 共享                                                  | **60–100 MB**（一个子进程）                                          |
| MCP 服务器子进程                  | 公布时使用工作区池；否则按会话                            | 按匹配的池条目共享，或在旧版回退中最多 3×N                                   |
| `FileReadCache`（子进程堆内）      | 共享                                                  | 解析一次                                                           |
| `CLAUDE.md` / 层级记忆解析 | 共享                                                  | 解析一次                                                           |
| OAuth 刷新 token 状态            | 共享                                                  | **一条刷新路径**                                                    |
| 自动记忆学习到的事实            | 共享                                                  | 每个子进程一个知识库                                                  |
| 冷启动                           | 仅首次                                                 | 首个会话后 <200 ms                                                    |

每个活跃的工作区运行时保持**一个 bridge 边界**。生产模式会尝试预热主通道并在失败后于首次使用时重试；受信任的次要工作区按需打开其通道和子进程，而不受信任的次要工作区永远不会这样做。只要至少有一个会话处于活动状态，通道就会保持活动。在最后一个 `killSession` 之后，运行时默认立即终止其子进程，或在配置的通道空闲宽限期后终止；通道级崩溃也会终止它而不选择另一个运行时。

**MCP 服务器子进程**在 `mcp_workspace_pool` 被公布时使用工作区范围的传输池：匹配的 `(workspace runtime, server name, config fingerprint)` 条目跨会话进行引用计数。如果该 capability 不存在，旧版每会话管理器会独立生成它们。

**对等代理（Cursor / Continue / Claude Code / OpenCode / Gemini CLI）都采用单进程多会话模式。** qwen-code 在代理层与它们匹配；本 PR 中的阶段 1 桥接器使相同的架构在 HTTP 上可见。

## 登录远程守护进程（issue #4175 PR 21）

当守护进程在远程 pod 上运行（与你没有共享显示器）时，客户端可以通过 HTTP 触发 OAuth 设备流。守护进程自己轮询 IdP；你的任务只是在任何有浏览器的设备上打开一个 URL。

> [!note]
>
> Qwen OAuth 免费层已于 2026-04-15 停用。下面的 `qwen-oauth` 示例记录了设备流协议形状和旧版提供商标识符；新设置应使用当前受支持的 auth 提供程序。

```bash
# 1. 启动流程。守护进程联系 IdP，返回 code + URL。
curl -X POST http://127.0.0.1:4170/workspace/auth/device-flow \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId":"qwen-oauth"}'
# → 201 {
#     "deviceFlowId": "fa07c61b-…",
#     "userCode": "USER-1",
#     "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
#     "verificationUriComplete": "https://chat.qwen.ai/...?user_code=USER-1",
#     "expiresAt": 1700000600000,
#     "intervalMs": 5000,
#     "attached": false
#   }

# 2. 在手机/笔记本电脑上访问该 URL，输入 user code。
# 3. 轮询以完成（或订阅 SSE 以获取 auth_device_flow_authorized 事件）：
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → 状态转换：pending → authorized
```

TypeScript SDK 将这两个步骤封装在一个辅助方法中：

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Open ${flow.verificationUri}\nCode: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**守护进程绝不会代你打开浏览器。** 即使在本地运行，守护进程也保持被动 —— 它返回 URL 并让 SDK/用户选择在哪里打开它。这是有意为之：在无头 pod 上调用 `xdg-open` 的守护进程会静默失败，从而掩盖了实际的 auth 表面。在你的客户端中模仿 `gh auth login` 的"按 Enter 键打开浏览器"UX。

**`--require-auth` 与开发便利性。** 设备流路由使用严格的修改门控（PR 15），这意味着无 token 的环回默认设置会返回 `401 token_required`。在本地开发期间，解决此问题的最简单方法是 `qwen serve --token=dev-token`；除非你要加固环回默认设置，否则不需要 `--require-auth`。

**跨守护进程限制。** `oauth_creds.json` 是守护进程共享的（`~/.qwen/oauth_creds.json`），因此在守护进程 A 中成功登录会被守护进程 B 的下一次 token 刷新自动获取 —— 但守护进程 B 的 SDK 客户端不会收到 `auth_device_flow_authorized` 事件（事件是按守护进程隔离的）。

**跨客户端接管。** 同一守护进程上的两个 SDK 客户端如果都针对同一提供程序 `POST /workspace/auth/device-flow`，将获得按提供程序隔离的单例：第一次调用启动全新的 IdP 请求并返回 `attached: false`；第二次调用返回**现有**的进行中条目，且 `attached: true`。接管操作会记录在审计跟踪中（在第二个客户端的 `X-Qwen-Client-Id` 下），但**不会**发出单独的事件 —— 一旦用户完成 IdP 页面，两个客户端最终都会观察到**相同的** `auth_device_flow_authorized`。如果你的 UI 区分"我发起了这个"和"我加入了别人的流程"，请根据 `start()` 返回的 `attached` 字段进行分支处理。

## 守护进程日志文件

`qwen serve` 在稳定的活跃路径上跨正常重启追加诊断记录：

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/daemon.log
```

每条文件记录包含一个随机的每启动 `runId` 和守护进程 PID。成功的稳定拥有者还会在支持符号链接的平台上将 `debug/daemon/latest` 更新为指向 `daemon.log`。在 macOS/Linux 上，使用以下命令跟踪轮转：

```bash
tail -F ~/.qwen/debug/daemon/daemon.log
```

在其他平台上，配置查看器在路径名被替换后重新打开。仅保留旧文件句柄的查看器将在轮转后停留在归档上。

日志捕获生命周期消息、路由错误（带有 `route=` 和 `sessionId=` 上下文）、ACP 子进程 stderr，以及 —— 当设置 `QWEN_SERVE_DEBUG=1` 时 —— 额外的桥接面包屑。今天输出到 stderr 的行仍然输出到 stderr；文件日志是**附加的**，而不是替代。

活跃文件在超过 10 MiB 之前轮转。每个家族在 `archive/` 下保留四个归档，每个文件记录上限为 256 KiB。内存中队列最多接受 4 MiB 的未结算文件负载。因此队列压力、轮转失败或文件系统失败可能会导致文件副本丢失；`GET /daemon/status?detail=full` 暴露记录器健康状况、问题和丢弃的记录/字节计数器。

一个日志命名空间中只有一个守护进程可以拥有稳定家族。并发守护进程写入 `debug/daemon/runs/run-<runId>/daemon.log`；启动横幅和完整状态包含权威路径。`runs/recent-fallback` 是最近回退家族的最佳努力定位器，可能指向仍然活跃的家族。健康的命名空间收敛到大约 100 MiB：稳定家族约 50 MiB 加上一个非活跃的回退家族。活跃或尚未过时的回退家族会被保留，因此并发守护进程或崩溃/重启风暴可能会临时使用更多空间。

一个运行时目录是一个归属和保留命名空间。当守护进程需要独立历史时，请使用不同的 `QWEN_RUNTIME_DIR` 值。新的守护进程日志目录对用户是私有的（`0700`），新文件在 POSIX 上使用 `0600`。没有基于年龄的过期。

### 禁用

设置 `QWEN_DAEMON_LOG_FILE=0`（或 `false`/`off`/`no`）以完全跳过文件日志记录。Stderr 输出不受影响。

### 与会话调试日志的关系

会话范围的调试日志（`~/.qwen/debug/<sessionId>.txt` 和 `~/.qwen/debug/latest` 符号链接）是独立的。守护进程日志位于同级的 `daemon/` 子目录中；此功能不会改变按会话调试的语义。

### 外部轮转

不要将外部 logrotate 规则指向活跃的 `daemon.log`。守护进程是唯一受支持的写入者和轮转器；外部重命名、删除或截断会使其大小模型失效。复制或传送记录而不修改家族是安全的。旧版 `serve-<pid>.log` 和 `serve-<pid>-<workspaceHash>.log` 文件保持不动，不计入新的保留策略。

## 运行时 MCP 服务器管理（issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514)）

在运行时添加或删除 MCP 服务器，而无需重启守护进程。运行时条目存在于一个临时覆盖层中，该覆盖层会**遮蔽（shadow）** 同名的设置定义服务器；底层的 `settings.json` / `mcpServers` 配置永远不会被写入。

**预检：** 在调用任一路由之前，检查 `caps.features` 中是否包含 `mcp_server_runtime_mutation`。没有此标签的旧版守护进程会返回 `404`。

### `POST /workspace/mcp/servers` —— 添加运行时 MCP 服务器

严格门控（需要 bearer token）。通过活动的 `McpClientManager` 立即连接服务器并发现其工具。

请求：

```json
{
  "name": "my-server",
  "config": {
    "command": "npx",
    "args": ["-y", "@my-org/mcp-server"]
  }
}
```

`name` 必须是字母数字加上 `_` 和 `-`（最多 256 个字符）。`config` 是与 `settings.json` `mcpServers` 条目中使用的相同的 MCP 服务器配置对象（依赖于传输的字段：stdio 的 `command`/`args`，SSE/HTTP 的 `url`）。安全敏感字段（`trust`、`env`、`cwd`、`oauth`、`headers`、`authProviderType`、`includeTools`、`excludeTools`、`type`）会被守护进程剥离并忽略。

响应 (200) —— 成功：

```json
{
  "name": "my-server",
  "transport": "stdio",
  "replaced": false,
  "shadowedSettings": false,
  "toolCount": 3,
  "originatorClientId": "client-1"
}
```

- `replaced: true` —— 已存在同名的运行时条目且配置指纹不同；旧连接被拆除，新连接建立。当指纹匹配时（幂等重新添加），`replaced` 为 `false`。
- `shadowedSettings: true` —— 存在同名的设置定义服务器；运行时条目现在遮蔽了它。设置条目未被修改，如果稍后删除运行时条目，它将重新出现。
- `toolCount` —— 在新连接的服务器上发现的工具数量。

响应 (200) —— 软拒绝（预算警告模式）：

```json
{
  "name": "my-server",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

当 `--mcp-budget-mode=warn` 且添加服务器将超出配置的 `--mcp-client-budget` 时返回。服务器**不会**被连接。调用方应向用户展示预算压力。

错误：

| 状态 | 代码                      | 触发条件                                                                                               |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | 名称为空、超过 256 个字符，或包含 `[A-Za-z0-9_-]` 之外的字符                      |
| `400`  | `missing_required_field`  | `config` 缺失或不是非空对象                                                          |
| `400`  | `invalid_client_id`       | 存在 `X-Qwen-Client-Id` 标头，但未在此工作区注册                            |
| `400`  | `invalid_config`          | 配置结构被 MCP 传输验证器拒绝                                               |
| `401`  | `token_required`          | 未配置 bearer token（严格门控）                                                           |
| `409`  | `mcp_budget_would_exceed` | `--mcp-budget-mode=enforce` 且预算已满                                                     |
| `502`  | `mcp_server_spawn_failed` | 服务器进程在连接期间退出或超时；body 包含 `serverName`、`exitCode`、`stderr` |
| `503`  | `acp_channel_unavailable` | 没有活动的 ACP 子进程（尚未创建任何会话）                                                |

### `DELETE /workspace/mcp/servers/:name` —— 删除运行时 MCP 服务器

严格门控。断开服务器连接并将其从运行时覆盖层中移除。幂等 —— 删除从未添加过的名称会返回跳过响应（而不是错误）。

`:name` 路径参数是 URL 编码的服务器名称。

响应 (200) —— 成功：

```json
{
  "name": "my-server",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` —— 被删除的运行时条目正在遮蔽同名的设置定义服务器。该设置条目现在取消遮蔽，并将在下次发现/重启时使用。

响应 (200) —— 幂等跳过：

```json
{
  "name": "ghost",
  "skipped": true,
  "reason": "not_present"
}
```

当名称不在运行时覆盖层中时返回（它可能仍存在于设置中 —— 设置条目无法通过此路由删除）。

错误：

| 状态 | 代码                      | 触发条件                                                                          |
| ------ | ------------------------- | ----------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | 名称为空、超过 256 个字符，或包含 `[A-Za-z0-9_-]` 之外的字符 |
| `400`  | `invalid_client_id`       | 存在 `X-Qwen-Client-Id` 标头，但未在此工作区注册       |
| `401`  | `token_required`          | 未配置 bearer token（严格门控）                                      |
| `503`  | `acp_channel_unavailable` | 没有活动的 ACP 子进程                                                             |

### 遮蔽语义

运行时条目在设置定义的 MCP 服务器之上形成一个临时覆盖层：

- **添加** 与设置条目同名的运行时服务器会**遮蔽**它 —— 运行时配置优先。原始设置条目不会被修改。
- **删除** 正在遮蔽设置条目的运行时服务器会**取消遮蔽**它 —— 设置定义的配置将在下次连接时再次变为活动状态。
- **守护进程重启** 会丢失所有运行时条目。只有设置定义的服务器能在重启后保留。运行时服务器的作用域为会话生命周期。
- **`GET /workspace/mcp`** 报告合并后的视图 —— 设置定义和运行时服务器都会出现在 `servers[]` 数组中。在今天的快照中，这两种来源之间没有线路级别的区别。

### 事件

这两个路由都会发出**工作区范围**的 SSE 事件（所有活动的会话总线都会接收它们）：

| 事件                | 触发时机                    | Payload 字段                                                                         |
| -------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| `mcp_server_added`   | `POST` 成功（未跳过）   | `name`、`transport`、`replaced`、`shadowedSettings`、`toolCount`、`originatorClientId` |
| `mcp_server_removed` | `DELETE` 成功（未跳过） | `name`、`wasShadowingSettings`、`originatorClientId`                                   |

被跳过的响应（`budget_warning_only`、`not_present`）**不会**触发事件。

现有 `mcp_guardrail_events` 接口中的预算相关事件（`mcp_budget_warning`、`mcp_child_refused_batch`），在运行时新增内容超出预算阈值时也会被触发。

## 下一步

- **需要配置长时间运行的守护进程？** 查阅 v0.16-alpha（仅限本地）的[本地启动模板（systemd / launchd / nohup / tmux）](./qwen-serve-deploy-local.md)。
- **构建客户端？** 请参阅 [DaemonClient TypeScript 快速入门](../developers/examples/daemon-client-quickstart.md)和 [HTTP 协议参考](../developers/qwen-serve-protocol.md)。
- **阅读源码？** 桥接代码位于 `packages/cli/src/serve/`；SDK 客户端位于 `packages/sdk-typescript/src/daemon/`。
- **追踪路线图？** 阶段 1.5 / 阶段 2 的进度可在 issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) 中查看。