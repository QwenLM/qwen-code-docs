# Daemon 模式（`qwen serve`）

将 Qwen Code 作为本地 HTTP daemon 运行，让多个客户端（IDE 插件、Web UI、CI 脚本、自定义 CLI）通过 HTTP + Server-Sent Events 共享同一个 agent 会话，而无需各自启动独立子进程。

> **🚧 v0.16-alpha**：`qwen serve` 在 v0.16-alpha 中首次发布至 npm，仅支持**纯文本聊天/编码**，且仅限**本地部署**。图片/文件附件、容器化部署（Docker / k8s / nginx 反向代理）以及远程/多 daemon 加固功能将在企业试点确认后的后续补丁中推出。详见 [v0.16-alpha 已知限制](#v016-alpha-已知限制)。

> **状态：** Stage 1（实验性）。协议接口已锁定为 issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §04 路由表。Stage 1.5（`qwen --serve` 标志——TUI 与同一 HTTP server 共存）和 Stage 2（进程内重构 + `mDNS`/OpenAPI/WebSocket/Prometheus 完善）将在其后推出。
>
> **范围说明：** Stage 1 面向**针对协议接口进行客户端原型开发**的开发者，以及**本地单用户/小团队协作**场景。面向生产级多客户端/长时运行/网络不稳定负载（移动端伴侣应用、承载 1000+ 会话的 IM 机器人）的场景需要 Stage 1.5+ 保障，本版本尚未提供。详见 [Stage 1.5+ 运行时保障](#stage-15-运行时保障) 以及 #3803 上的收敛路线图。

## 功能概览

- **内置 Web Shell UI** — `qwen serve` 在根路径（`http://127.0.0.1:4170/`）开箱即用地提供基于浏览器的 Web Shell；运行 `qwen serve --open` 可自动在浏览器中打开。UI 与 API 共享同一 origin，无需额外端口或反向代理。使用 `--no-web` 可以仅启动 API daemon。
- **一个 agent 进程，多个客户端** — 在默认的 `sessionScope: 'single'` 模式下，所有连接到 daemon 的客户端共享同一个 ACP 会话，实现跨客户端的实时协作——同一对话、同一文件 diff、同一权限提示。
- **断线重连安全的流式传输** — SSE 支持 `Last-Event-ID` 重连，客户端断线后可精准续传（在环形缓冲区的重放窗口内）。
- **首响应者权限** — 当 agent 请求工具执行权限时，所有已连接客户端均可看到该请求；第一个响应的客户端获得控制权。
- **一个 daemon，一个工作区** — 每个 `qwen serve` 进程在启动时绑定到唯一一个工作区（参见 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02）。多工作区部署需在不同端口上为每个工作区运行独立 daemon（或通过编排器管理）。
- **远程运行时控制**（[#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17）— 修改会话的审批模式（`POST /session/:id/approval-mode`）、按工作区切换工具启用状态（`POST /workspace/tools/:name/enable`）、创建空的 `QWEN.md`（`POST /workspace/init`，仅机械创建——不调用模型；如需 AI 填写，后续调用 `POST /session/:id/prompt`）、在预算检查前提下重启单个 MCP server（`POST /workspace/mcp/:server/restart`），或在不重启 daemon 的情况下动态添加/移除 MCP server（`POST /workspace/mcp/servers`、`DELETE /workspace/mcp/servers/:name`）。所有操作均受严格认证保护——请先配置 `--token`。
- **会话摘要**（[#4175](https://github.com/QwenLM/qwen-code/issues/4175) 后续）— 获取活跃会话的一句话"上次进度"摘要（`POST /session/:id/recap`）。通过 core 的 `generateSessionRecap` 向快速模型发起旁路查询，不影响主聊天历史或 SSE 流。非严格认证（与 `/prompt` 相同）；SDK 辅助方法为 `client.recapSession(sessionId)`。
  - **已知限制——token 成本放大：** 该路由是纯成本端点（每次调用均为 LLM 旁路查询，无状态收益），且 v1 中 daemon 没有针对该路由的速率限制。在无 token 的本地默认配置下，有缺陷或恶意的本地客户端可大量请求该接口以消耗 token。在共享开发主机上暴露 daemon 前，请配置 `--token`（以及可选的 `--require-auth`）。
  - **并发摘要安全性：** 对同一会话同时发起两个 `/recap` 请求，会独立运行两次旁路查询。`generateSessionRecap` 通过 `GeminiClient.getChat().getHistory()` 读取聊天历史快照，并通过独立的 `BaseLlmClient.generateText` 调用（经 `runSideQuery`）处理；它不会向会话的 `GeminiChat` 追加或修改任何内容。可安全地从多个客户端并发调用。

## v0.16-alpha 已知限制

`qwen serve` 的首个 npm 版本（v0.16-alpha）有意保持精简——仅面向在自己机器上运行 daemon 的开发者提供纯文本聊天/编码功能。以下列表明确说明了已推迟的功能，方便使用者提前规划；这些功能均在 v0.16.x 补丁路线图或近期版本中。

**产品功能——仅限文本：**

- ✅ 文本提示与文本响应（聊天、编码、工具调用、MCP 集成）
- ❌ **提示路径上的图片/文件附件** — `MessageEmitter` 目前仅渲染文本；多模态回显将在有图片需求的 alpha 目标确认后推出（#4175 chiga0 #27 P0 项）
- ❌ **流式上传** — 与多模态同步推出

**部署功能——仅限本地：**

- ✅ 回环地址（`127.0.0.1`，默认值）— 无需认证，适合开发工作站
- ✅ 通过 `systemd` / `launchd` / `nohup &` / `tmux` 本地启动 — 参见[本地启动模板](./qwen-serve-deploy-local.md)
- ✅ 通过 `QWEN_SERVER_TOKEN` 环境变量自带 bearer token（[认证](#认证)章节说明配置方法）
- ❌ **容器化部署** — Docker / Compose / Kubernetes / nginx 反向代理（含 TLS 终止）在 v0.16-alpha 中**不可用**。待企业试点确认后推迟至 v0.16.x（否则因无人验证而腐化）。
- ❌ **同一主机上的多 daemon 协调** — 强制执行 `1 daemon = 1 工作区 × N 会话`。跨主机联邦、实例路径 token 键控及过期 token 清理推迟至 v0.16.x。
- ❌ **自动生成 daemon token** — alpha 阶段需自带 token（执行一条 `openssl rand -hex 32` 即可）。自动生成 + token 存储基础设施推迟至 v0.16.x。

**加固——本地单用户最小可用：**

- ✅ 启动时安全门控（在无 token 情况下拒绝非回环绑定，[PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236)）
- ✅ 变更路由认证门控、会话级权限路由（Wave 4 PRs）
- ✅ MCP 防护 + 多客户端权限协调（F2 / F3）
- ✅ **提示绝对截止时间 + SSE writer 空闲超时** — 通过 `--prompt-deadline-ms` 和 `--writer-idle-timeout-ms` 选择启用；启用后通过 `prompt_absolute_deadline` 和 `writer_idle_timeout` 能力标签告知客户端。
- ✅ **HTTP 速率限制** — 通过 `--rate-limit` 和各层阈值选择启用；启用后通过 `rate_limit` 告知客户端。
- ⏸️ **Prometheus 指标 + 负载测试工具** — 推迟至 v0.17 F4 Phase-1 规模化仪表化，届时 30-50 个活跃会话将成为真实目标。
- ⏸️ **`--max-body-size` CLI 标志** — daemon 默认执行 `express.json({ limit: '10mb' })`，足以覆盖纯文本提示（模型上下文窗口远低于 10 MiB 字符）。将在 v0.16.x 中通过标志支持调节。

关于"Stage 1 中不会修复的问题"的详细说明（单主机会话状态变更模型 + N 个并行会话共享一个 ACP 子进程），参见下文[Stage 1 范围边界](#stage-1-范围边界--stage-15-中不会修复的问题)。

## 快速上手

### 1. 启动 daemon（回环，无认证）

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

默认绑定到 `127.0.0.1:4170`。在回环地址上 bearer auth **关闭**，本地开发"开箱即用"。daemon 绑定到当前工作目录；使用 `--workspace /path/to/dir` 可覆盖。

**打开 Web Shell UI。** 访问 `http://127.0.0.1:4170/`（或使用 `qwen serve --open` 启动 daemon 时自动打开），即可使用完整的浏览器终端——聊天、diff、工具调用和权限提示。UI 与 API 共享同一 origin，在 daemon 根路径提供服务。本指南后续将使用原始 HTTP 请求，以便你直接对 API 进行脚本化操作。

### 2. 健康检查

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

`workspaceCwd` 字段暴露了绑定的工作区，客户端可据此进行预检并在 `POST /session` 时省略 `cwd`。
`limits.maxPendingPromptsPerSession` 字段告知当前每会话提示准入上限；`null` 表示禁用上限。

daemon 还为客户端 UI 和运维人员提供只读运行时快照：`GET /daemon/status`、`GET /workspace/mcp`、
`GET /workspace/skills`、`GET /workspace/providers`、`GET /workspace/env`、
`GET /workspace/preflight`、
`GET /session/:id/context`、`GET /session/:id/supported-commands`、
`GET /session/:id/tasks` 以及 `GET /session/:id/lsp`。

`GET /session/:id/lsp` 返回结构化的每会话 LSP 状态。启动 daemon 时加上 `--experimental-lsp` 可在生成的 agent 会话中启用 LSP；否则该路由返回 `enabled: false` 且无服务器列表。

`GET /daemon/status` 是统一的故障排查快照。默认的 `detail=summary` 仅读取内存中的 daemon 状态（会话、权限、SSE/ACP 传输计数、速率限制拒绝数、进程内存、解析后的限制），不启动 ACP 子进程。使用 `GET /daemon/status?detail=full` 可获取每会话诊断信息、ACP 连接详情、auth 设备流计数及工作区状态，适用于主动排查问题时使用。

`GET /workspace/mcp`、`GET /workspace/skills` 和 `GET /workspace/providers`
报告实时 ACP 运行时状态，在 daemon 空闲时不会启动 ACP 子进程；空闲 daemon 返回 `initialized: false` 及空快照。会话激活后切换为 `initialized: true` 并展示真实状态。

`GET /workspace/env` 和 `GET /workspace/preflight` 始终以 `initialized: true` 响应，不受 ACP 状态影响。`env` 不查询 ACP（仅 daemon 进程信息）；`preflight` 从 `process.*` 响应 daemon 级别的检查项，并在子进程空闲时为 ACP 级别检查项输出 `status: 'not_started'` 占位符。

`GET /workspace/env` 报告 daemon 进程的运行时、平台、沙箱、代理信息，以及白名单 secret 环境变量（如 `OPENAI_API_KEY`）的**存在性**（不暴露值）。代理 URL 在传输前会剥离凭据，仅保留 `host:port`。该路由始终直接从 daemon 进程响应，不启动 ACP 子进程。

`GET /workspace/preflight` 返回就绪检查列表。**Daemon 级别检查项**（Node 版本、CLI 入口、工作区目录、ripgrep、git、npm）始终渲染。**ACP 级别检查项**（auth、MCP 发现、skills、providers、工具注册表、egress）需要活跃的 ACP 子进程——daemon 空闲时输出 `status: 'not_started'` 占位符，而不是为填充数据而启动 ACP。失败原因映射到封闭的 `errorKind` 枚举（`missing_binary`、`auth_env_error`、`init_timeout`、`protocol_error`、`missing_file`、`parse_error`、`blocked_egress`），客户端 UI 可据此渲染结构化的修复建议。

daemon 还提供工作区文件辅助接口：

- `GET /file` 读取文本文件并返回 `sha256:<hex>` 格式的原始字节哈希。
- `GET /file/bytes` 读取有界原始字节窗口并返回 base64 内容。
- `POST /file/write` 创建或替换文本文件。
- `POST /file/edit` 应用一次精确的文本替换。

写入/编辑操作属于**严格变更路由**：即使在回环地址上也需要已配置的 bearer token，否则返回 `token_required`。替换和编辑操作需要来自 `GET /file`（或完整窗口 `GET /file/bytes`）的最新 `expectedHash`。`create` 不会覆盖已有文件。对已忽略路径的显式写入被允许但会被记录审计。二进制写入、删除/移动/创建目录及递归创建父目录不在此接口范围内。

### 3. 创建会话

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

可以省略 `cwd`——路由会回退到 daemon 绑定的工作区。若提交的 `cwd` 与绑定的工作区不匹配，返回 `400 workspace_mismatch`（daemon 仅绑定一个工作区；如需使用不同工作区，请启动独立 daemon）。

第二个客户端向 `/session` 发送请求（任何匹配的 `cwd` 或不填）将得到 `"attached": true`——表示已加入现有 agent 会话。

### 4. 订阅事件流（请在另一个终端中先执行此步骤）

```bash
SESSION_ID="<from step 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

`data:` 行是**完整事件信封**——`{id?, v, type, data, originatorClientId?}`——JSON 序列化在单行中。ACP 载荷（本例中的 `sessionUpdate` 块）位于信封内的 `data` 字段下。SSE 层的 `id:` / `event:` 行是为 EventSource 客户端提供的便利；相同的值也出现在 JSON 信封内，供使用原始 `fetch` 的消费者读取。

请在发送提示**之前**订阅此流——SSE 重放缓冲区保存最近 8000 个事件，晚到的订阅者可通过 `Last-Event-ID` 追赶进度，但对于"观察单次提示"的简单场景，建议先订阅再等待实时流。

该流会输出 `session_update`（LLM 块、工具调用、使用情况）、`permission_request`（工具需要审批）、`permission_resolved`（有人投票）、`model_switched`、`model_switch_failed`，以及终止帧 `session_died`（agent 子进程崩溃——SSE 随后关闭）和 `client_evicted`（你的队列溢出——SSE 随后关闭）。

### 5. 发送提示（回到原来的终端）

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

步骤 4 中的 `curl -N` 将实时打印事件帧。

## 认证

对于回环之外的任何场景，你**必须**提供 bearer token：

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → boot refuses without QWEN_SERVER_TOKEN
```

客户端需在每次请求中携带 `Authorization: Bearer $QWEN_SERVER_TOKEN`。`/health` 接口**仅在回环绑定时**豁免认证，以便 pod 内部的 k8s/Compose 存活探针（daemon 监听在 `127.0.0.1`）无需凭据。在非回环绑定（`--hostname 0.0.0.0` 等）时，`/health` 与其他路由一样需要 token——否则攻击者可以通过探测任意地址来确认 daemon 的存在。使用 `/capabilities` 端到端验证 token 是否正确（该接口始终需要认证）：

> **加固回环（`--require-auth`）。** 默认的回环免认证行为对单用户笔记本足够，但在共享开发主机、CI runner 或多租户工作站上（任何本地用户都能 `curl 127.0.0.1:4170`）并不安全。传入 `--require-auth` 可在所有路由上强制要求 bearer token——包括 `/health` 和 `/capabilities`——即使绑定到 `127.0.0.1`。没有 token 时启动失败。启用该标志后，**未认证**客户端无法通过 `/capabilities` 发现认证要求；发现途径是 401 响应体本身。认证成功后，`caps.features.require_auth` 标签是部署已加固的事后确认（适用于审计/合规 UI）：
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

token 比对采用恒定时间算法（SHA-256 + `crypto.timingSafeEqual`）；401 响应对"缺少 header"、"scheme 错误"和"token 错误"统一处理，防止侧信道区分。

## CLI 标志

| 标志                                    | 默认值          | 用途                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | `4170`          | TCP 端口。`0` = OS 分配的临时端口。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--hostname <addr>`                     | `127.0.0.1`     | 绑定接口。超出回环范围需要 token。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--token <str>`                         | —               | Bearer token。回退到 `QWEN_SERVER_TOKEN` 环境变量（会去除首尾空白——便于 `$(cat token.txt)` 使用）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--require-auth`                        | `false`         | 即使在回环地址上也拒绝在无 bearer token 的情况下启动。适用于共享开发主机/CI runner/多租户工作站（任何本地用户都能访问监听端口）的加固场景。需配合 `--token` 或 `QWEN_SERVER_TOKEN` 使用才能启动；同时对 `/health` 也启用 bearer 认证门控。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--max-sessions <n>`                    | `20`            | 并发活跃会话上限。当上限命中时，需要生成新子进程的 `POST /session` 请求返回 `503`（含 `Retry-After: 5`）；附加到已有会话**不计入**此上限。设为 `0` 可禁用。面向单用户/小团队使用场景；如果你的部署有足够的 RAM/FD 余量（每会话约 30–50 MB），可适当提高。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--max-pending-prompts-per-session <n>` | `5`             | 每会话已接受但未结算的提示上限，包括队列中的提示和当前活跃提示。超出时 bridge 同步返回 `503`、`Retry-After: 5` 和 `code: "prompt_queue_full"`，不返回 `promptId`。设为 `0` 可禁用。`branchSession` 使用同一 FIFO 序列化，但不计入此提示上限。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--workspace <path>`                    | `process.cwd()` | 此 daemon 绑定的绝对工作区路径（参见 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02——1 daemon = 1 工作区）。`cwd` 不匹配的 `POST /session` 请求返回 `400 workspace_mismatch`。多工作区部署请在不同端口分别运行 `qwen serve`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--max-connections <n>`                 | `256`           | 监听器级别的 TCP 连接上限（`server.maxConnections`）。与会话数量无关，限制原始 socket 数量——慢速/幽灵 SSE 客户端在连接满时于 accept 阶段被拒绝。若你的部署每会话有大量 SSE 订阅者，请与 `--max-sessions` 一起调整。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--event-ring-size <n>`                 | `8000`          | 每会话 SSE 重放环深度（#3803 §02 目标）。设定 `GET /session/:id/events` 配合 `Last-Event-ID: N` 可用的积压量。越大 = 重连余量越大，代价是每会话多几百 KB 内存。SDK 客户端还可通过 `?maxQueued=N`（范围 `[16, 2048]`，默认 256）为特定订阅请求更大的每订阅者积压上限。daemon 还会在队列填满 75% 时发出非终止的 `slow_client_warning` SSE 帧，客户端可在被驱逐前主动清空/重连。预检 `caps.features.slow_client_warning`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--mcp-client-budget <n>`               | —               | **每 ACP 会话**活跃 MCP client 的正整数上限（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14 v1；PR 23 将此升级为通过共享 MCP 池实现的每工作区级别）。配合 `--mcp-budget-mode` 使用。未设置时不执行会计驱动的强制限制（但 `GET /workspace/mcp` 仍报告 `clientCount`）。与 claude-code 的 `MCP_SERVER_CONNECTION_BATCH_SIZE`（限制启动并发，而非总 client 数）不同。预检 `caps.features.mcp_guardrails`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `--mcp-budget-mode <m>`                 | `warn` / `off`  | `--mcp-client-budget` 的执行方式。`warn`（设置 budget 时默认）：不拒绝连接，快照的 `budgets[0].status` 在达到预算 ≥75% 时翻转为 `warning`。`enforce`：超过上限的连接被拒绝，每服务器单元显示 `disabledReason: 'budget'`，按 `mcpServers` 声明顺序确定性处理。`off`（未设置 budget 时默认）：纯可观测性。不设置 budget 时启用 `enforce` 会导致启动失败。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--http-bridge`                         | `true`          | Stage 1 模式：每个 daemon 一个 `qwen --acp` 子进程（启动时绑定到一个工作区，参见 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02）；N 个会话通过 ACP `newSession()` 复用该子进程。Stage 2 原生进程内模式稍后推出。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--allow-origin <pat>`                  | —               | T2.4（[#4514](https://github.com/QwenLM/qwen-code/issues/4514)）。浏览器 webui 客户端的跨域允许列表。可重复使用。每个值为 `*`（任意 origin——若无 bearer token 则启动失败；回环上建议启用 `--require-auth` 以对 `/health` 和 `/demo` 也实施 bearer 门控，因为这两者在回环上默认是预认证的）或规范 URL origin（`<scheme>://<host>[:<port>]`，无尾部斜杠/路径/userinfo/查询）。**不支持子域通配符（`https://*.example.com`）** — 请逐一列出每个子域，或使用 `*` 配合已配置 token（完整加固建议使用 `--require-auth`）。匹配的 origin 获得 CORS 响应 header（`Access-Control-Allow-Origin`、`Vary: Origin`、methods、headers、max-age 及暴露的 `Retry-After`）；不匹配的 origin 仍返回 403，信封与当前默认墙相同。`Origin: null`（沙箱 iframe、file:// 文档）始终被拒绝，即使在 `*` 下也不例外。通过 `caps.features.allow_origin` 预检。回环自 origin 访问不受影响。 |
| `--web` / `--no-web`                    | `true`          | 在 daemon 根路径提供已构建的 Web Shell SPA（`GET /`、`/assets/*` 及 SPA 深链回退）。静态 shell 在 bearer auth 门控**之前**注册——浏览器无法在 `<script>` 子资源或地址栏导航中附加 token，shell 不含任何 secret，且所有 API 路由无论如何都受 token 门控。在非回环绑定时，stderr 会输出一行警告说明 UI 可在无认证情况下访问。使用 `--no-web` 可运行纯 API daemon。若构建中缺少 Web Shell 资源，daemon 会记录一条提示并以仅 API 模式运行，此标志无效。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--open`                                | `false`         | 监听器就绪后，在默认浏览器中打开 Web Shell（若配置了 token，则以 URL 片段形式附加 `#token=`——片段不会发送至服务器，避免 token 出现在访问日志和 Referer header 中）。在 `--no-web` 模式下、或无头/CI/SSH 等无浏览器环境中，此标志无效。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

> **负载参数调优。** `--max-sessions` 是**新建子进程**的上限。
> 另有三层也会限制负载——为高并发部署调优时，请一并考虑：
>
> - **监听器级别**：`--max-connections` / `server.maxConnections=256`
>   限制原始 TCP 连接（慢客户端背压）。
> - **每会话订阅者**：EventBus 默认每会话限 64 个 SSE 订阅者；第 65 个客户端收到终止 `stream_error` 并被关闭。
> - **每会话提示准入**：
>   `--max-pending-prompts-per-session=5` 限制一个会话接受的队列中 + 活跃提示数量。超出返回 `503` 含 `Retry-After: 5`。
> - **每订阅者积压**：每 SSE 客户端 256 帧队列；超出上限的客户端收到终止 `client_evicted` 帧并被关闭（一个慢消费者不会拖垮 daemon）。
>
> 这些上限相互作用：`--max-sessions × 64 订阅者 × 256 帧`
> 是 EventBus 层的最坏情况内存占用，而
> `--max-sessions × --max-pending-prompts-per-session` 限制了准入层已接受的提示工作量。默认规格适用于单用户/小团队负载；多租户部署请逐步提升（并关注 RSS）。

> **MCP client 防护（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** 若工作区在 `mcpServers` 中声明了 30 个 MCP server，在不设置上限的情况下将启动 30 个 client。`--mcp-client-budget=N` 限制活跃 MCP client 数量；`--mcp-budget-mode={enforce,warn,off}` 选择执行行为。设置 budget 时默认为 `warn`（快照展示警告但不拒绝 client——在启用强制执行前适合用于测量实际 fanout）。`enforce` 模式下被拒绝的 server 在其单元显示 `disabledReason: 'budget'`，`budgets[0]` 单元显示 `status: 'error'` + `errorKind: 'budget_exhausted'`。slot 预留按 server 名称进行，在重连/发现超时后仍有效——被拒绝的 server 不能占用健康 server 的 slot。
>
> ⚠️ **v1 范围：每会话，而非每工作区。** daemon 内每个 ACP 会话都有自己的 `Config`/`McpClientManager`（通过每会话的 `newSessionConfig` 创建）。budget 限制**每会话**的活跃 MCP client，而非跨工作区所有会话的聚合。`GET /workspace/mcp` 的快照反映的是引导会话的视图（单元携带 `scope: 'session'` 以保持诚实）。若运行 5 个并发 ACP 会话且 `--mcp-client-budget=10`，daemon 中最多可能有 50 个活跃 MCP client——上限是按会话执行的。**Wave 5 PR 23（共享 MCP 池）** 将引入工作区级别的管理器，实现真正的每工作区强制执行。
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # later, after telemetry shows your real-world distribution:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> 这与 claude-code 的 `MCP_SERVER_CONNECTION_BATCH_SIZE`（限制启动并发）**不同**，两者正交。PR 23 将添加真正的共享 MCP 池（`budgets[]` 中的 `scope: 'workspace'` 单元，与每会话单元并列）；PR 14 v1 是在现有每会话管理器上的进程内计数器 + 软执行。
>
> **推送事件（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）。** 订阅 `GET /session/:id/events` 的 SDK 客户端在预算阈值跨越时会收到类型化帧——`mcp_budget_warning`（合成帧，每次上行 75% 阈值穿越触发一次，回滞复位点为 37.5%，通过 `mcp_guardrail_events` 告知）和 `mcp_child_refused_batch`（在 `enforce` 模式下每次发现轮次合并一次；来自 `readResource` 懒加载生成拒绝的长度为 1）。`GET /workspace/mcp` 的快照仍是重连后状态的事实来源；事件是变更边缘。适用于无需轮询的实时仪表板展示。

## 默认部署威胁模型

- **仅 `127.0.0.1`** — 回环绑定，无需认证。
- **`--hostname 0.0.0.0` 需要 token** — 无 token 时启动失败。
- **`LOOPBACK_BINDS` 包含 IPv6** — `::1` 和 `[::1]` 也被视为回环，适用免 token 规则。
- **Host header 允许列表** — 在**回环**绑定上，daemon 检查 `Host:` 是否匹配 `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port`（大小写不敏感，遵循 RFC 7230 §5.4），防御 DNS 重绑定攻击。**非回环绑定（`--hostname 0.0.0.0`）有意绕过 Host 允许列表** — 运营者已自行选择了暴露面，bearer token 门控是唯一认证层；反向代理/SNI/客户端证书绑定是运营者的职责，而非 daemon 的职责。若在非回环绑定上需要基于 Host 的隔离，请在前端代理层终止 TLS 并检查 Host。
- **CORS 默认拒绝所有浏览器 Origin** — 返回 `403` JSON。通过 **`--allow-origin <pattern>`**（可重复，T2.4 #4514）选择性放行特定浏览器 origin。每个值为字面量 `*`（任意 origin——若无 bearer token 则启动失败；回环上建议使用 `--require-auth` 完整加固，因为 `/health` 和 `/demo` 在回环上默认预认证）或规范 URL origin（`<scheme>://<host>[:<port>]`，无尾部斜杠/路径/userinfo）。匹配的 origin 获得正确的 CORS 响应 header（`Access-Control-Allow-Origin: <echoed>`、`Vary: Origin`，以及标准 methods/headers/max-age 和暴露的 `Retry-After`）；不匹配的 origin 仍返回 403，信封与默认墙相同。`caps.features.allow_origin` 被有条件地告知，SDK/webui 客户端可在发起跨域请求前预检 daemon 是否支持。示例：`qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`。回环自 origin 访问（如 `/demo` 页面）不受影响——由一个独立的 Origin-strip shim 处理，无论 `--allow-origin` 如何配置。**未配置 `--allow-origin` 的浏览器 webui** 仍可回退到 Stage 1 之前的方案：将其打包为原生 shell（Electron/Tauri）以避免发送 `Origin` header，或通过同 origin 反向代理前置 daemon。
- **派生的 `qwen --acp` 子进程继承 daemon 的环境变量**，但有一项显式清除：子进程启动前会移除 `QWEN_SERVER_TOKEN`（daemon 自身的 bearer；agent 不需要）。其他一切——`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `QWEN_*` / `DASHSCOPE_API_KEY` / 你的自定义 `modelProviders[].envKey` 等——均透传，因为 agent 合理地需要这些来向 LLM 认证。**这是有意为之，并非沙箱。** agent 以相同 UID 运行且具有 shell 工具访问权限，因此无论如何 `~/.bashrc` / `~/.aws/credentials` / `~/.npmrc` 中的内容都可通过提示注入访问。环境变量透传不是安全边界；以用户为信任根才是。不要用带有环境变量凭据的身份运行 `qwen serve`，除非你愿意信任 agent 使用这些凭据。
- **每订阅者有界 SSE 队列** — 慢客户端队列溢出时收到 `client_evicted` 终止帧并被关闭；一个卡住的消费者不会拖垮 daemon。
- **每会话提示准入上限** — 默认为每会话 5 个已接受但未结算的提示。有缺陷的客户端无法为一个会话无限排入提示或临时 SSE 等待。
- **优雅关闭** — SIGINT/SIGTERM 先排干 agent 子进程，再关闭监听器（每个子进程 10 秒截止）。

> ⚠️ **Stage 1 已知缺口——权限是 daemon 全局而非每会话（BUy4H）。** `pendingPermissions` 存在于 daemon 范围；持有 bearer token 的任何客户端都可以对其可见的任何会话的任何 `requestId` 投票（SSE `permission_request` 事件在载荷中携带 requestId）。在单用户/小团队信任模型下（每个已认证客户端都是同一个人或受信任的协作者）这是可接受的。Stage 1.5 将迁移至 `POST /session/:id/permission/:requestId` + 会话级别待审权限映射 + 每客户端身份（下游审查中的必须项 #3）；在此之前，请勿将 `qwen serve` 暴露在与不可信方共享的 bearer 后面。
>
> ⚠️ **Stage 1 已知缺口——`POST /session/:id/prompt` 请求体上限 10 MB（BUy4L）。** 包含图片/PDF/音频且超过 10 MB 的多模态提示将在路由逻辑运行前于请求体解析阶段失败（无流式传输，无中途中止上传）。变通方案：在客户端侧缩减内容，或传递文件路径让 agent 通过 `readTextFile` 读取。Stage 1.5 将在 `/prompt` 上支持 `multipart/form-data` 或分块编码，避免大型提示触达硬限制。
>
> ⚠️ **Stage 1 已知缺口——NAT 后的幽灵 SSE 连接。** daemon 通过心跳上的 TCP 背压（15 秒间隔）检测死亡客户端。在未发送 TCP RST 的情况下消失的客户端（例如 NAT 盒静默丢弃空闲流）会将内核级别的 socket 保持"活跃"，直到 Node 的 keepalive 探针超时——在 Linux 默认配置下通常约为 2 小时。在此类 NAT 后的 `--hostname 0.0.0.0` 部署中，幽灵 SSE 连接可能积累，最终触达 256 `server.maxConnections` 上限。
>
> 设置 [`--writer-idle-timeout-ms <n>`](#截止时间和-writer-空闲超时)（issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9）可通过显式的应用层空闲截止时间弥补这一缺口：当 `n` 毫秒内没有成功刷新任何写入时，daemon 发出携带 `reason: 'writer_idle_timeout'` 的终止 `client_evicted` 帧（也在 `data.errorKind` 中镜像）并关闭流。该标志默认关闭以保持向后兼容——在会吞掉 RST 的网络上运营的操作员应选择明显高于 15 秒心跳间隔的值（例如 `60000`–`300000`），以确保合法的空闲连接不被驱逐，同时及时回收真正卡住的 writer。通过 SDK 预检 `caps.features.includes('writer_idle_timeout')` 以确认 daemon 是否支持。

### 截止时间和 writer 空闲超时

Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 提供了两个可选启用的标志，弥补了 15 秒心跳 + AbortSignal 无法覆盖的长时运行/远程部署缺口。两者默认关闭——单用户回环工作流保持完全不变。

| 标志                           | 环境变量                             | 默认值 | 作用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`      | 未设置 | 单次 `POST /session/:id/prompt` 的服务端挂钟时间上限。超时后 daemon 中止提示的 AbortController 并返回 HTTP `504`，附带 `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`。每提示请求体字段 `deadlineMs` 可将有效截止时间**缩短**至低于该标志，但不能延长。能力标签（条件性）：`prompt_absolute_deadline`。                                                                                                                                                                                                                      |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`  | 未设置 | 每 SSE 连接的空闲截止时间。当 `n` 毫秒内没有成功刷新任何写入时——既没有真实事件也没有 15 秒心跳——daemon 发出携带 `data.reason = 'writer_idle_timeout'`（也镜像在 `data.errorKind`）的终止 `client_evicted` 帧并关闭流。**请选择明显高于 15 秒心跳的值**（例如 `30000`–`300000`），避免合法的空闲流被驱逐；低于 `15000` 的值**会**在第一次心跳触发前驱逐本来健康的空闲连接（仅适用于测试/短时开发会话）。能力标签（条件性）：`writer_idle_timeout`。 |

两个标志均接受正整数毫秒值；`0`、`NaN`、非整数或负值在启动时会报清晰错误并退出。CLI 标志优先于环境变量；显式的 `ServeOptions` 字段（嵌入调用者）优先于环境变量。SDK 消费者应在依赖任一行为前预检对应的能力标签——早于本 PR 的 daemon 不包含这两个标签，请求中的 `deadlineMs` 字段将被静默忽略。

## 多会话与多工作区部署

根据 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02，每个 `qwen serve` 进程在启动时绑定到**一个工作区**。在该工作区内，它通过 agent 原生的会话映射将 N 个会话复用到单个 `qwen --acp` 子进程上——各会话共享子进程的进程/OAuth 状态/文件读取缓存/层级记忆解析。

要托管**多个工作区**（一个用户，多个仓库；或同一主机上的多个用户），请运行**多个 daemon 进程**——每个工作区一个，各自使用独立端口，由 systemd / docker-compose / k8s / `qwen-coordinator` 参考编排器管理。这一取舍是有意为之：每个子进程对应一个工作区，确保 `loadSettings(cwd)` / OAuth / MCP server 范围与绑定目录保持对齐，不会随请求漂移。

> **在 `modelServiceId` attach 前先订阅事件流。** 当客户端携带 `modelServiceId` 发送 `POST /session`，且工作区已有会话使用不同模型运行时，daemon 会发出内部 `setSessionModel` 调用——失败**不会**以 HTTP 错误形式传播（会话仍在当前模型上正常运行）。可见的失败信号是会话 SSE 流上的 `model_switch_failed` 事件。若你先调用 `POST /session` 再打开 `GET /session/:id/events`，将错过失败事件，静默地继续与错误模型交互。请先打开 SSE 流，或在订阅时携带 `Last-Event-ID: 0` 以重放环中最早的可用事件。

要处理多个**用户**（各自有独立配额、审计日志、沙箱），或扩展到超出单进程能力的规模（冷启动预算、FD 数量、RSS），请在外部编排器后面为每个用户的每个工作区启动一个 daemon。该编排器（多租户/OIDC/配额/审计/k8s）**超出** qwen-code 项目范围——设计思路参见 issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture"。

## 加载和恢复持久化会话

daemon 通过两个路由将 ACP 的 `session/load` 和恢复流程暴露为 HTTP 接口：

| 路由                       | 使用时机                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`   | 客户端**没有**已渲染的历史（冷重连、选择器后打开）。daemon 通过 SSE 重放每条持久化轮次，订阅者可看到完整对话。能力标签：`session_load`。                                                                                   |
| `POST /session/:id/resume` | 客户端屏幕上已有这些轮次，只需要 daemon 侧的句柄。模型上下文在 agent 侧恢复，无需 UI 重放——SSE 流保持干净。能力标签：`session_resume`（`unstable_session_resume` 作为旧客户端的已弃用别名仍保留）。 |

TypeScript SDK 在 `DaemonSessionClient` 上以静态工厂方法暴露这两种操作：

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// 冷重连——daemon 将通过 SSE 重放历史。
const session = await DaemonSessionClient.load(client, 'persisted-id');

// 或者，如果 UI 已有历史，跳过重放：
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // 首先是重放的 `session_update` 帧（仅 load），
  // 然后是实时事件。
}
```

调用前请预检 `caps.features.session_load` / `caps.features.session_resume`——旧版 daemon 返回 `404`。`unstable_session_resume` 仍作为已弃用的兼容别名被告知。对同一 id 的并发同类请求会合并；跨类型竞争（`load` 与 `resume` 同时发生）返回 `409 restore_in_progress`，含 `Retry-After: 5`。完整错误信封参见[协议参考](../developers/qwen-serve-protocol.md)。

注意：历史重放受 SSE 环大小限制（默认 8000 帧）。长历史且轮次较多时可能超出限制——最早的帧会被静默丢弃。对于非常长的会话，建议使用 `resume` 并依赖客户端本地持久化的 UI。

## 持久性模型

**在 Stage 1 中，会话在 daemon 重启后仍是短暂的**，但磁盘上的持久化会话可以重新加载：

- 子进程崩溃会发布 `session_died` 并将活跃会话从 daemon 的映射中移除。如果可以生成新的 agent 子进程，磁盘上持久化的会话**可以**通过 `POST /session/:id/load` 重新加载。
- daemon 重启会丢失所有进行中的活跃会话。持久化会话保留在磁盘上，可在新 daemon 进程上加载，遵循相同的工作区绑定规则。
- 长时间客户端断线（在轮次繁多的情况下超过 5 分钟）可能超过 SSE 重放环（默认 8000 帧）——`Last-Event-ID` 重连成功但状态可能不一致。对于移动端/网络不稳定客户端，请在长时间断线后重新打开 SSE，或调用 `POST /session/:id/load` 从磁盘重放。
- 文件操作（`writeTextFile`）在崩溃时是原子的（先写入再重命名）；在 daemon 重启时并非原子的，不会重放——文件写入要么成功了，要么没有。

如果你的集成需要超出 `session/load` 能力的服务端跨重启持久性（例如服务器管理的重试队列），仍需应用层的状态恢复。不要在 daemon 的会话中保存长时运行、重启敏感的状态。

## Stage 1.5+ 运行时保障

Stage 1 的契约面向原型开发。根据 [#3889 chiga0 下游消费者审查](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644)，以下内容**不在** Stage 1 中——生产级集成需要 Stage 1.5+ 才能依赖它们：

**严肃下游使用的阻塞项：**

1. **`loadSession` / `unstable_resumeSession` over HTTP** — 没有这个，没有集成能在子进程崩溃或 daemon 重启后存活，协调 daemon 的编排器也无法恢复状态。
2. **持久化客户端身份（配对 token + 每客户端吊销）** — Stage 1 使用一个共享 bearer；泄露 token 会吊销所有人，且 `originatorClientId` 是客户端自声明的，而非 daemon 从已认证身份中盖章的。

**可靠性基线：**

3. ~~**客户端发起心跳路径**~~ — 已通过 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 9 交付。`POST /session/:id/heartbeat` 在 daemon 上记录最后访问时间戳（能力标签 `client_heartbeat`）；SDK 辅助方法为 `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`。
4. **投票在首响应者竞争中落败时发出 `permission_already_resolved` 事件** — 目前 UI 必须从 `404` 推断状态。
5. ~~**更大的重放环**~~ — 已提升至 8000。**每会话可配置重放环**仍待解决——移动端/轮次繁多工作负载可能需要每会话覆盖。
6. **`client_evicted` 前发出 `slow_client_warning` 事件** — 软背压，让行为良好的慢客户端在被终止前自我限速（减少渲染深度、丢弃块）。

**集成人体工程学：**

7. **IM 风格上下文的 `POST /session/:id/_meta`** — 附加到后续提示的每会话键值（聊天 id、发送者、线程 id），取代每频道的临时解决方案。
8. **`/capabilities` 实际特性协商** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }` 让客户端能检测到版本漂移，而不是回退到"未知帧，忽略"。
9. **一流的持久性文档**（本节）— 已在上方交付。

完整收敛路线图在 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) 上跟踪。

## Stage 1 范围边界 — Stage 1.5 中不会修复的问题

两个结构性选择是 Stage 1 / 1.5 / 2 主线路线图的明确非目标。如果你的用例依赖其中任何一个，请提前规划，不要等待我们修复。

### 会话状态仅限本地变更（参见 [LaZzyMan review #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721)）

Stage 1.5 计划将 TUI 描述为进程内 EventBus 订阅者。但实际上 **TUI UI 严格大于 wire 协议**：

- **本地专用 UI** — 约 15 个 Ink 对话框组件（`ModelDialog`、`MemoryDialog`、`PermissionsDialog`、`SessionPicker`、`WelcomeBackDialog`、`FolderTrustDialog` 等）和 `local-jsx` 斜杠命令（`/ide`、`/auth`、`/init`、`/resume`、`/rename`、`/delete`、`/language`、`/arena` 等）渲染终端特定的 Ink JSX。HTTP/SSE 上的远程客户端无法等效渲染 Ink，这些流程不发出 wire 事件。
- **无 wire 事件的会话状态变更** — `/approval-mode`、`/memory add`、`/mcp add-server`、`/agents`、`/tools enable/disable`、`/auth`、`/init`（写入 `CLAUDE.md`）均会改变 agent 行为，但目前只有 `/model` 发布事件（`model_switched`）。

**Stage 1 选择——评审中的方案 (A)**：不将这些变更提升为 wire 事件。两种部署模式有不同的后果。

#### 模式 1 — 无头 `qwen serve`（本 PR）

daemon 内不运行 TUI shell。上述斜杠命令在此模式下**不存在**——没有终端 UI 可以执行它们。因此会话状态为：

- **启动时冻结**，针对 `approval-mode` / `memory` / `agents` / `tools` 允许列表 / `auth`——所有内容在 daemon 的 `qwen --acp` 子进程启动时从 settings + 磁盘加载；在会话生命周期内不可变。settings 中定义的 MCP server 同样在启动时冻结，但**运行时添加的 server**（通过 `POST /workspace/mcp/servers`）可以在不重启的情况下添加或移除。
- **通过 HTTP 可变**，通过 `POST /session/:id/model`（发布 `model_switched`）、`POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name`（发布 `mcp_server_added` / `mcp_server_removed`）以及权限投票（`POST /permission/:requestId`）。

**结果：** 无头模式下的远程客户端能看到**完整会话状态**。没有 TUI 隐藏额外状态；不可能发生漂移。若要修改 `approval-mode`，请用新 settings 重启 daemon。MCP server 现在可以通过变更路由（`POST /workspace/mcp/servers`、`DELETE /workspace/mcp/servers/:name`）在运行时添加/移除——参见[运行时 MCP server 管理](#运行时-mcp-server-管理issue-4514)。

#### 模式 2 — Stage 1.5 `qwen --serve` 共存 TUI（本 PR 中不包含）

当 Stage 1.5 推出 `qwen --serve`（TUI 进程与同一 HTTP server 共存）时，TUI **确实**与远程客户端并存。本地操作员输入 `/approval-mode yolo` 或 `/mcp add-server` 会变更会话状态，而 HTTP 上的远程客户端没有事件可以观察到此变更。

在此模式下，TUI 是一个**"超级客户端"**——它与远程客户端观察相同的 agent 对话，并且可以变更远程客户端无法变更的会话状态。不对称性在于：

- ✅ TUI 和远程客户端都能看到相同的 agent 消息、工具调用、文件 diff、权限提示。
- ❌ 只有 TUI 能看到/变更 approval-mode / memory / MCP server 列表 / agents / tools 允许列表 / auth 状态。

**模式 2 的结果：** 如果远程客户端 UI 尝试镜像会话设置，在任何 TUI 斜杠命令之后都可能发生漂移。远程客户端应在 **attach/重连时重新获取状态**（使用 `Last-Event-ID: 0` 重放环中最早的事件，如 `model_switched`）；它们**不应**依赖增量事件来追踪 TUI 侧的变更。

#### 为何选择 (A) 而不是 (B)（将变更提升为 `session_state_changed` 事件族）

(B) 是更雄心勃勃的答案，但会将 Stage 1.5 锁定在一个显著更大的 wire 接口上，还必须干净地通过计划中的进程内重构。我们宁愿诚实地走更小的范围。会话状态事件分类工作——枚举哪些 TUI 流程设计上仅限本地，哪些在未来可选启用的 (B) 扩展下有可能毕业到 wire——移至 [#3803](https://github.com/QwenLM/qwen-code/issues/3803)，不在 Stage 1.5 代码中。

### N 个并行会话共享一个 `qwen --acp` 子进程

同一工作区上的多个会话**共享一个 `qwen --acp` 子进程**，通过 agent 原生的多会话支持实现（`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`）。bridge 为每个会话调用 `connection.newSession({cwd, mcpServers})`——agent 将它们存储在会话映射中，并按每次调用的 sessionId 进行解复用。

在同一工作区 N=5 个会话时的具体成本：

| 资源                                | 每会话   | N=5 时                         |
| ----------------------------------- | -------- | ------------------------------ |
| Daemon Node 进程                    | 一个     | **30–50 MB**（一个 daemon）    |
| `qwen --acp` 子进程                 | 共享     | **60–100 MB**（一个子进程）    |
| MCP server 子进程                   | 每会话   | 3×N（若配置不同）              |
| `FileReadCache`（子进程堆内）       | 共享     | 解析一次                       |
| `CLAUDE.md` / 层级记忆解析          | 共享     | 解析一次                       |
| OAuth 刷新 token 状态               | 共享     | **一条刷新路径**               |
| 自动记忆学习到的知识                 | 共享     | 每个子进程一个知识库           |
| 冷启动                              | 仅首次   | 首个会话后 <200 ms             |

bridge 每个 daemon **保持一个 channel**（每个工作区一个 daemon，参见 §02）。只要有至少一个会话活跃，channel 就保持存活；最后一个 `killSession`（或 channel 级别的崩溃）会杀死子进程。

**MCP server 子进程**目前仍是每会话的——每个会话的配置可以指定不同的 server，因此它们独立生成。Stage 1.5 后续：按 `(工作区, 配置哈希)` 对 MCP server 子进程进行引用计数，让相同配置共享。本 PR 不在范围内。

**同类 agent（Cursor / Continue / Claude Code / OpenCode / Gemini CLI）均在单进程中支持多会话。** qwen-code 在 agent 层与它们匹配；本 PR 中的 Stage 1 bridge 通过 HTTP 将相同的架构公开出来。

## 登录到远程 daemon（issue #4175 PR 21）

当 daemon 运行在远程 pod 上（与你没有共享显示屏）时，客户端可以通过 HTTP 触发 OAuth 设备流。daemon 自行轮询 IdP；你只需在任何有浏览器的设备上打开一个 URL。

> [!note]
>
> Qwen OAuth 免费层已于 2026-04-15 停用。以下 `qwen-oauth` 示例记录了设备流协议形状和遗留的提供商标识符；新的设置应使用当前支持的 auth 提供商。

```bash
# 1. 启动流程。daemon 联系 IdP，返回 code + URL。
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

# 2. 在手机/笔记本上访问该 URL，输入 user code。
# 3. 轮询完成状态（或订阅 SSE 等待 auth_device_flow_authorized 事件）：
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → status transitions: pending → authorized
```

TypeScript SDK 将两个步骤封装为单个辅助方法：

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Open ${flow.verificationUri}\nCode: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**daemon 不会代你打开浏览器。** 即使在本地运行，daemon 也保持被动——返回 URL，让 SDK/用户选择在哪里打开。这是有意为之的：在无头 pod 上调用 `xdg-open` 的 daemon 会静默失败，掩盖了实际的 auth 入口。在你的客户端中参照 `gh auth login` 的"按 Enter 打开浏览器"交互模式。

**`--require-auth` 与开发便利性。** 设备流路由使用严格的变更门控（PR 15），这意味着无 token 的回环默认会返回 `401 token_required`。本地开发时最简单的解决方法是 `qwen serve --token=dev-token`；除非你在加固回环默认设置，否则不需要 `--require-auth`。

**跨 daemon 限制。** `oauth_creds.json` 是 daemon 共享的（`~/.qwen/oauth_creds.json`），因此在 daemon A 中成功登录会被 daemon B 的下次 token 刷新自动获取——但 daemon B 的 SDK 客户端不会收到 `auth_device_flow_authorized` 事件（事件是每 daemon 的）。

**跨客户端接管。** 同一 daemon 上两个 SDK 客户端都向同一提供商 `POST /workspace/auth/device-flow` 时，会得到该提供商的单例：第一次调用启动新的 IdP 请求，返回 `attached: false`；第二次调用返回现有的进行中条目，`attached: true`。接管被记录在审计日志中（记录在第二个客户端的 `X-Qwen-Client-Id` 下），但**不**发出单独的事件——两个客户端最终观察到相同的 `auth_device_flow_authorized`（一旦用户完成 IdP 页面）。如果你的 UI 需要区分"我发起的"和"我加入的他人流程"，请根据 `start()` 返回的 `attached` 字段进行判断。

## Daemon 日志文件

`qwen serve` 将每进程诊断日志写入：

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log
```

同目录下的 `latest` 软链接始终指向当前进程的日志，因此 `tail -f ~/.qwen/debug/daemon/latest` 将跟随当前运行中的 daemon。

日志记录生命周期消息、路由错误（含 `route=` 和 `sessionId=` 上下文）、ACP 子进程 stderr，以及在设置 `QWEN_SERVE_DEBUG=1` 时的额外 bridge 面包屑。当前输出到 stderr 的行仍输出到 stderr；文件日志是**补充性的**，不是替代。

### 禁用

将 `QWEN_DAEMON_LOG_FILE` 设置为 `0`（或 `false`/`off`/`no`）可完全跳过文件日志记录。stderr 输出不受影响。

### 与会话调试日志的关系

会话级别的调试日志（`~/.qwen/debug/<sessionId>.txt` 和 `~/.qwen/debug/latest` 软链接）是独立的。daemon 日志位于同级 `daemon/` 子目录下；每会话调试语义不受此功能影响。

### 无日志轮换

daemon 日志无限期追加写入。如果日志变大，请手动轮换。未来可能添加自动轮换功能；通过 [#4548](https://github.com/QwenLM/qwen-code/issues/4548) 后续工作跟踪。

## 运行时 MCP server 管理（issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514)）

在不重启 daemon 的情况下动态添加或移除 MCP server。运行时条目存储在临时覆盖层中，该层**遮蔽**同名的 settings 定义 server；底层的 `settings.json` / `mcpServers` 配置永不被修改。

**预检：** 调用任意路由前请检查 `caps.features` 中是否包含 `mcp_server_runtime_mutation`。不包含此标签的旧版 daemon 返回 `404`。

### `POST /workspace/mcp/servers` — 添加运行时 MCP server

严格认证（需要 bearer token）。通过活跃的 `McpClientManager` 立即连接 server 并发现其工具。

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

`name` 必须为字母数字加 `_` 和 `-`（最多 256 字符）。`config` 与 `settings.json` 的 `mcpServers` 条目中使用的 MCP server 配置对象相同（传输相关字段：stdio 用 `command`/`args`，SSE/HTTP 用 `url`）。安全敏感字段（`trust`、`env`、`cwd`、`oauth`、`headers`、`authProviderType`、`includeTools`、`excludeTools`、`type`）会被 daemon 剥离并忽略。

响应（200）——成功：

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

- `replaced: true` — 同名的运行时条目已存在且配置指纹不同；旧连接被拆除，新连接建立。当指纹匹配（幂等重复添加）时，`replaced` 为 `false`。
- `shadowedSettings: true` — 存在同名的 settings 定义 server；运行时条目现在遮蔽它。settings 条目不受影响，待运行时条目移除后重新生效。
- `toolCount` — 新连接 server 上发现的工具数量。

响应（200）——软性拒绝（budget warn 模式）：

```json
{
  "name": "my-server",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

当 `--mcp-budget-mode=warn` 且添加此 server 会超出配置的 `--mcp-client-budget` 时返回。server **未被**连接。调用方应向用户展示 budget 压力提示。

错误：

| Status | Code                      | 触发条件                                                                                              |
| ------ | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | 名称为空、超过 256 字符，或包含 `[A-Za-z0-9_-]` 以外的字符                                           |
| `400`  | `missing_required_field`  | `config` 缺失或不是非 null 对象                                                                       |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id` header 存在但未在此工作区注册                                                      |
| `400`  | `invalid_config`          | MCP 传输验证器拒绝了配置形状                                                                          |
| `401`  | `token_required`          | 未配置 bearer token（严格门控）                                                                       |
| `409`  | `mcp_budget_would_exceed` | `--mcp-budget-mode=enforce` 且 budget 已满                                                            |
| `502`  | `mcp_server_spawn_failed` | server 进程在连接期间退出或超时；响应体携带 `serverName`、`exitCode`、`stderr`                        |
| `503`  | `acp_channel_unavailable` | 无活跃 ACP 子进程（尚未创建任何会话）                                                                 |

### `DELETE /workspace/mcp/servers/:name` — 移除运行时 MCP server

严格认证。断开 server 连接并从运行时覆盖层移除。幂等——移除从未添加过的名称返回 skip 响应（不报错）。

`:name` 路径参数为 URL 编码的 server 名称。

响应（200）——成功：

```json
{
  "name": "my-server",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` — 已移除的运行时条目正在遮蔽同名的 settings 定义 server。该 settings 条目现在已解除遮蔽，将在下次发现/重启时使用。

响应（200）——幂等 skip：

```json
{
  "name": "ghost",
  "skipped": true,
  "reason": "not_present"
}
```

当名称不在运行时覆盖层中时返回（该名称可能仍存在于 settings 中——settings 条目无法通过此路由移除）。

错误：

| Status | Code                      | 触发条件                                                                        |
| ------ | ------------------------- | ------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | 名称为空、超过 256 字符，或包含 `[A-Za-z0-9_-]` 以外的字符                      |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id` header 存在但未在此工作区注册                                |
| `401`  | `token_required`          | 未配置 bearer token（严格门控）                                                  |
| `503`  | `acp_channel_unavailable` | 无活跃 ACP 子进程                                                               |

### 遮蔽语义

运行时条目在 settings 定义的 MCP server 之上形成临时覆盖层：

- **添加**与 settings 条目同名的运行时 server 会**遮蔽**它——运行时配置优先。原始 settings 条目不被修改。
- **移除**正在遮蔽 settings 条目的运行时 server 会**解除遮蔽**——settings 定义的配置在下次连接时重新生效。
- **daemon 重启**会丢失所有运行时条目。只有 settings 定义的 server 在重启后保留。运行时 server 的生命周期与会话绑定。
- **`GET /workspace/mcp`** 报告合并视图——settings 定义和运行时 server 均出现在 `servers[]` 数组中。快照中目前没有针对两种来源的 wire 级别区分。

### 事件

两个路由均发出**工作区级别**的 SSE 事件（所有活跃会话总线均会收到）：

| 事件                 | 发出时机                        | 载荷字段                                                                               |
| -------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| `mcp_server_added`   | `POST` 成功（非 skip）          | `name`、`transport`、`replaced`、`shadowedSettings`、`toolCount`、`originatorClientId` |
| `mcp_server_removed` | `DELETE` 成功（非 skip）        | `name`、`wasShadowingSettings`、`originatorClientId`                                   |

Skip 响应（`budget_warning_only`、`not_present`）**不**发出事件。

当运行时添加跨越 budget 阈值时，现有 `mcp_guardrail_events` 接口的 budget 相关事件（`mcp_budget_warning`、`mcp_child_refused_batch`）也会触发。

## 下一步

- **需要设置长时运行的 daemon？** 参见 [本地启动模板（systemd / launchd / nohup / tmux）](./qwen-serve-deploy-local.md)，适用于 v0.16-alpha（仅本地）。
- **构建客户端？** 参见 [DaemonClient TypeScript 快速上手](../developers/examples/daemon-client-quickstart.md)和 [HTTP 协议参考](../developers/qwen-serve-protocol.md)。
- **阅读源码？** Bridge 代码位于 `packages/cli/src/serve/`；SDK 客户端位于 `packages/sdk-typescript/src/daemon/`。
- **跟踪路线图？** Stage 1.5 / Stage 2 进度在 issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) 上跟踪。
