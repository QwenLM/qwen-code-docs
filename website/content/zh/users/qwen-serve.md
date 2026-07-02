# 守护进程模式（`qwen serve`）

将 Qwen Code 作为本地 HTTP 守护进程运行，使多个客户端（IDE 插件、Web UI、CI 脚本、自定义 CLI）能够通过 HTTP + Server-Sent Events 共享同一个 agent 会话，而不是各自生成独立的子进程。

> **🚧 v0.16-alpha**：`qwen serve` 首次随 v0.16-alpha 发布到 npm，仅支持**纯文本聊天/编码**和**本地部署**。prompt 路径上的图片/文件附件、容器化部署（Docker / k8s / nginx 反向代理）以及远程/多守护进程的安全加固，将在企业试点确认后通过后续补丁发布。完整的延期功能列表请参阅 [v0.16-alpha 已知限制](#v016-alpha-known-limits)。

> **状态**：阶段 1（实验性）。协议接口已锁定在 issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) 的 §04 路由表中。阶段 1.5（`qwen --serve` 标志 — TUI 共同托管同一个 HTTP 服务器）和阶段 2（进程内重构 + `mDNS`/OpenAPI/WebSocket/Prometheus 优化）紧随其后。
>
> **范围说明**：阶段 1 专为**基于协议接口开发客户端原型的开发者**以及**本地单用户/小团队协作**设计。生产级的多客户端/长时间运行/网络不稳定工作负载（如移动端伴侣应用、处理 1000+ 聊天的 IM 机器人）需要阶段 1.5+ 提供的保障，而这些在本版本中尚未包含。完整的差距列表请参阅 [阶段 1.5+ 运行时保障](#stage-15-runtime-guarantees)，融合路线图请参阅 #3803。

## 核心功能

- **内置 Web Shell UI** — `qwen serve` 开箱即在根路径（`http://127.0.0.1:4170/`）提供基于浏览器的 Web Shell；运行 `qwen serve --open` 可在浏览器中自动打开。它与 API 同源，无需额外端口或反向代理。传入 `--no-web` 可启动纯 API 守护进程。
- **一个 agent 进程，多个客户端** — 在默认的 `sessionScope: 'single'` 下，连接到守护进程的每个客户端共享同一个 ACP 会话。支持在同一对话、同一文件 diff、同一权限提示上进行跨客户端实时协作。
- **支持安全重连的流式传输** — 带有 `Last-Event-ID` 重连机制的 SSE 允许客户端断开后从断点处（在 ring 的重放窗口内）精确恢复。
- **首个响应者权限机制** — 当 agent 请求运行工具的权限时，所有连接的客户端都会看到该请求；首个响应的客户端获得处理权。
- **一个守护进程，一个工作区** — 每个 `qwen serve` 进程在启动时严格绑定到一个工作区（参见 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02）。多工作区部署需在独立端口上为每个工作区运行一个守护进程（或置于编排器之后）。
- **实验性的守护进程托管通道** — `qwen serve --channel <name>` 启动一个由守护进程生命周期管理的通道 worker。该 worker 是一个独立进程，通过 SDK 连回守护进程，并在 `GET /daemon/status` 中报告其状态。
- **远程运行时控制**（[#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17）— 更改会话的审批模式（`POST /session/:id/approval-mode`），按工作区启用/禁用工具（`POST /workspace/tools/:name/enable`），生成空的 `QWEN.md`（`POST /workspace/init`，仅机械生成 — 不调用模型；若需 AI 填充，请接着调用 `POST /session/:id/prompt`），使用预算预检重启单个 MCP 服务器（`POST /workspace/mcp/:server/restart`），或在运行时添加/移除 MCP 服务器而无需重启守护进程（`POST /workspace/mcp/servers`，`DELETE /workspace/mcp/servers/:name`）。所有操作均受严格门控 — 需先配置 `--token`。
- **会话回顾**（[#4175](https://github.com/QwenLM/qwen-code/issues/4175) 后续）— 获取活跃会话的单句“我上次进行到哪了”摘要（`POST /session/:id/recap`）。它将核心的 `generateSessionRecap` 封装为针对快速模型的 side-query；不会污染主聊天历史或 SSE 流。非严格门控（与 `/prompt` 策略相同）；SDK 辅助方法 `client.recapSession(sessionId)`。
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
- ❌ **单主机上的多守护进程协调** — 强制执行 `1 个守护进程 = 1 个工作区 × N 个会话`。跨主机联邦、实例路径 token 键控和过期 token 清理延期至 v0.16.x。
- ❌ **自动生成守护进程 token** — alpha 版本需自带 token（只需执行一次 `openssl rand -hex 32`）。自动生成 + token 存储基础设施延期至 v0.16.x。

**安全加固 — 本地单用户最低可用：**

- ✅ 启动时安全门控（在无 token 情况下拒绝非环回绑定，[PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236)）
- ✅ 变更路由身份验证门控，会话级权限路由（Wave 4 PR）
- ✅ MCP 防护栏 + 多客户端权限协调（F2 / F3）
- ✅ **Prompt 绝对截止时间 + SSE writer 空闲超时** — 通过 `--prompt-deadline-ms` 和 `--writer-idle-timeout-ms` 启用；启用后通过 `prompt_absolute_deadline` 和 `writer_idle_timeout` 公布。
- ✅ **HTTP 速率限制** — 通过 `--rate-limit` 和每级阈值启用；启用后通过 `rate_limit` 公布。
- ⏸️ **Prometheus 指标 + 负载测试工具** — 延期至 v0.17 F4 Phase-1 规模 instrumentation，待 30-50 个活跃会话成为实际目标时实施。
- ⏸️ **`--max-body-size` CLI 标志** — 守护进程默认强制执行 `express.json({ limit: '10mb' })`，这足以覆盖纯文本 prompt（模型上下文窗口远小于 10 MiB 字符）。可在 v0.16.x 中通过标志调整。

有关“阶段 1 中我们不会修复什么”的更详细枚举（单主机会话状态变更模型 + N 个并行会话共享一个 ACP 子进程），请参阅下方的[阶段 1 范围边界 — 阶段 1.5 中我们不会修复什么](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15)。

## 快速开始

### 1. 启动守护进程（环回，无身份验证）

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

默认绑定为 `127.0.0.1:4170`。在环回地址上 bearer 身份验证**默认关闭**，以便本地开发“开箱即用”。守护进程绑定到当前工作目录；使用 `--workspace /path/to/dir` 可覆盖此设置。

**打开 Web Shell UI。** 浏览至 `http://127.0.0.1:4170/`（或使用 `qwen serve --open` 启动守护进程以自动打开）即可进入完整的浏览器终端 — 包含聊天、diff、工具调用和权限提示。UI 在守护进程根路径提供，与 API 同源。本指南的其余部分使用原始 HTTP，以便你可以直接通过脚本调用 API。

### 2. 基础检查

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

`workspaceCwd` 字段暴露了绑定的工作区，以便客户端进行预检并在 `POST /session` 中省略 `cwd`。
`limits.maxPendingPromptsPerSession` 字段公布了当前每个会话的 prompt 准入上限；`null` 表示禁用该上限。

### 从守护进程运行通道

```bash
# Start one configured channel under qwen serve
qwen serve --channel telegram

# Start several configured channels under one daemon-owned worker
qwen serve --channel telegram --channel feishu

# Start all configured channels
qwen serve --channel all
```

此模式为实验性且由守护进程管理。它不会取代独立的 `qwen channel start` 命令：独立通道仍使用 ACP 支持的 `AcpBridge` 服务。使用 `qwen serve --channel` 时，守护进程会在 HTTP 运行时就绪后启动一个通道 worker 进程。如果 worker 在启动后退出，守护进程将继续运行，且 `GET /daemon/status` 会报告 `channel_worker_exited` 警告。自动重启 worker 的功能被延期。

守护进程绑定到一个工作区，因此每个选定通道的 `cwd` 必须解析为守护进程的工作区。`--channel all` 不能与命名通道结合使用。

守护进程还为客户端 UI 和运维人员暴露只读的运行时快照：`GET /daemon/status`、`GET /workspace/mcp`、`GET /workspace/skills`、`GET /workspace/providers`、`GET /workspace/env`、`GET /workspace/preflight`、`GET /session/:id/status`、`GET /session/:id/context`、`GET /session/:id/supported-commands`、`GET /session/:id/tasks` 和 `GET /session/:id/lsp`。

`GET /session/:id/status` 返回单个会话的实时 bridge 摘要：`sessionId`、`workspaceCwd`、`createdAt`、可选的 `displayName`、`clientCount` 和 `hasActivePrompt`。当守护进程持有该 id 的活跃会话时返回 `200` 及摘要，否则返回 `404`（body 为 `{ "error": …, "sessionId": … }`）。使用它来轮询某个已知会话是否仍在运行（`hasActivePrompt`）或有多少客户端连接（`clientCount`），而无需获取并扫描整个分页会话列表：

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

这是原始的实时会话视图，因此 `clientCount` 和 `hasActivePrompt` 与 `GET /workspace/:id/sessions` 中的对应条目匹配 — 但这两个路由并非字节级完全相同。列表端点会用持久化的会话存储数据丰富每个条目：其 `createdAt` 是持久化的首次 prompt 时间，并添加了 `updatedAt` 以及从存储的标题或首次 prompt 派生的 `displayName`。而 `/status` 报告的是实时会话自身的 `createdAt`，省略 `updatedAt`，并且仅在实时会话上设置了 `displayName` 时才返回。

`GET /session/:id/lsp` 返回结构化的每会话 LSP 状态。使用 `--experimental-lsp` 启动守护进程以在生成的 agent 会话中启用 LSP；否则该路由返回 `enabled: false` 且无服务器。

`GET /daemon/status` 是综合的故障排查快照。默认的 `detail=summary` 仅读取内存中的守护进程状态（会话、权限、SSE/ACP 传输计数、速率限制拒绝、进程内存、已解析的限制），且不会启动 ACP 子进程。在主动排查问题时，使用 `GET /daemon/status?detail=full` 获取每会话诊断、ACP 连接详情、身份验证设备流计数和工作区状态部分。

`GET /workspace/mcp`、`GET /workspace/skills` 和 `GET /workspace/providers` 报告实时的 ACP 运行时，且在空闲时不会启动 ACP 子进程；空闲的守护进程返回 `initialized: false` 及空快照。一旦会话存活，它们将切换为 `initialized: true` 并暴露真实状态。

`GET /workspace/env` 和 `GET /workspace/preflight` 无论 ACP 状态如何，始终返回 `initialized: true`。`env` 从不咨询 ACP（仅守护进程信息）；`preflight` 从 `process.*` 响应守护进程级单元格，并在子进程空闲时为 ACP 级单元格发出 `status: 'not_started'` 占位符。

`GET /workspace/env` 报告守护进程运行时的 runtime、platform、sandbox、proxy，以及白名单 secret 环境变量（如 `OPENAI_API_KEY`）的**存在性**（绝不返回值）。代理 URL 在发送到网络前会被剥离凭据并简化为 `host:port`。该路由始终直接从守护进程响应，且从不生成 ACP 子进程。

`GET /workspace/preflight` 返回就绪检查列表。**守护进程级单元格**（Node 版本、CLI 入口、工作区目录、ripgrep、git、npm）始终渲染。**ACP 级单元格**（身份验证、MCP 发现、skills、providers、工具注册表、出站）需要活跃的 ACP 子进程 — 当守护进程空闲时，它们发出 `status: 'not_started'` 占位符，而不是为了填充它们就生成 ACP。失败映射到封闭的 `errorKind` 枚举（`missing_binary`、`auth_env_error`、`init_timeout`、`protocol_error`、`missing_file`、`parse_error`、`blocked_egress`），以便客户端 UI 渲染结构化的修复建议。

守护进程还暴露工作区文件辅助工具：

- `GET /file` 读取文本文件并返回原始字节的 `sha256:<hex>` 哈希。
- `GET /file/bytes` 读取有界的原始字节窗口并返回 base64 内容。
- `POST /file/write` 创建或替换文本文件。
- `POST /file/edit` 应用一次精确的文本替换。

Write/edit 是**严格变更路由**：即使在环回地址上也需要配置 bearer token，否则返回 `token_required`。替换和编辑需要来自 `GET /file`（或全窗口 `GET /file/bytes`）的最新 `expectedHash`。`create` 永远不会覆盖。允许对忽略路径进行显式写入，但会被审计。二进制写入、删除/移动/mkdir 以及递归父目录创建不属于此接口范围。

### 3. 打开会话

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

可以省略 `cwd` — 路由将回退到守护进程绑定的工作区。提交与绑定工作区不匹配的 `cwd` 会返回 `400 workspace_mismatch`（守护进程严格绑定到一个工作区；若需不同工作区，请启动单独的守护进程）。

第二个向 `/session` 提交的客户端（无论 `cwd` 是否匹配或是否提供）都会得到 `"attached": true` — 他们现在共享该 agent。

### 4. 订阅事件流（先在另一个终端中执行）

```bash
SESSION_ID="<from step 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

`data:` 行是**完整的事件信封** — `{id?, v, type, data, originatorClientId?}` — 在单行上进行 JSON 字符串化。ACP 负载（本例中的 `sessionUpdate` 块）位于该信封内的 `data` 下。SSE 级的 `id:` / `event:` 行是为了方便 EventSource 客户端；相同的值也出现在 JSON 信封内，因此 raw-`fetch` 消费者也能获取它们。

请在发送 prompt **之前**打开此流 — SSE 重放缓冲区保存最近的 8000 个事件，因此迟到的订阅者可以通过 `Last-Event-ID` 赶上进度，但对于简单的“观察单个 prompt”场景，最简单的方法是先订阅并让其实时流式传输。

该流发出 `session_update`（LLM 块、工具调用、使用情况）、`permission_request`（工具需要审批）、`permission_resolved`（有人投票）、`model_switched`、`model_switch_failed`，以及终止帧 `session_died`（agent 子进程崩溃 — SSE 随后关闭）和 `client_evicted`（你的队列溢出 — SSE 随后关闭）。

### 5. 发送 prompt（回到原始终端）

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

步骤 4 中的 `curl -N` 会在帧到达时打印它们。

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

token 比较是恒定时间的（SHA-256 + `crypto.timingSafeEqual`）；401 响应在“缺少 header”、“错误 scheme”和“错误 token”之间是统一的，因此侧信道无法区分。

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
| `--token <str>`                         | —               | Bearer token。回退到 `QWEN_SERVER_TOKEN` 环境变量（会自动去除首尾空格 —— 方便使用 `$(cat token.txt)`）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--require-auth`                        | `false`         | 如果没有 bearer token 则拒绝启动，即使在环回地址上也是如此。加固了 `127.0.0.1` 的开发者默认配置，适用于共享开发主机 / CI 运行器 / 多租户工作站等任何本地用户都能访问监听器的场景。仅在设置了 `--token` 或 `QWEN_SERVER_TOKEN` 时才能启动；同时也会将 `/health` 置于 bearer token 保护之下。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--tls-cert <path>`                     | —               | PEM 证书文件的路径。通过 **HTTPS** 而非 HTTP 提供服务。必须与 `--tls-key` 配对使用（如果只提供一个则启动失败）。通过局域网 IP 解锁安全上下文浏览器 API —— 如语音输入（`getUserMedia`）、WebRTC —— 否则浏览器会在纯 `http://` 下阻止这些 API。仅限 TLS 终端；不支持自动生成 / ACME。参见下方的 [HTTPS / TLS](#https--tls-for-mobile--cross-device-access)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--tls-key <path>`                      | —               | PEM 私钥文件的路径。必须与 `--tls-cert` 配对使用。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--max-sessions <n>`                    | `20`            | 并发活跃会话的上限。当达到上限时，会生成新子进程的新 `POST /session` 请求将返回 `503`（并带有 `Retry-After: 5`）；附加到现有会话的请求不计入此限制。设置为 `0` 可禁用。此默认值适用于单用户/小团队使用；如果你的部署环境有足够的 RAM/文件描述符余量（每个会话约 30–50 MB），可以调高此值。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--max-pending-prompts-per-session <n>` | `5`             | 每个会话中由 `POST /session/:id/prompt` 接受但尚未处理的 prompt 上限，包括排队的 prompt 和当前活动的 prompt。当溢出时，bridge 会在返回 `promptId` 之前同步拒绝，返回 `503`、`Retry-After: 5` 和 `code: "prompt_queue_full"`。设置为 `0` 可禁用。`branchSession` 在同一个 FIFO 上串行化，但不计入此 prompt 上限。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--workspace <path>`                    | `process.cwd()` | 此守护进程绑定的绝对工作区路径（根据 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 —— 1 个守护进程 = 1 个工作区）。如果 `POST /session` 请求的 `cwd` 不匹配，将返回 `400 workspace_mismatch`。对于多工作区部署，请在不同的端口上为每个工作区运行一个 `qwen serve`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--channel <name\|all>`                 | —               | 实验性的守护进程管理的 channel worker。重复此参数可选择多个已配置的 channel，或传递 `all` 以启动所有已配置的 channel。`all` 不能与具名 channel 结合使用。所选 channel 的 `cwd` 值必须解析为守护进程的工作区。worker 由 `qwen serve` 拥有；停止守护进程即可停止由 serve 管理的 channel。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--max-connections <n>`                 | `256`           | 监听器级别的 TCP 连接上限（`server.maxConnections`）。限制原始 socket 数量，与会话数量无关 —— 一旦达到上限，缓慢/幽灵 SSE 客户端将在 accept 时被拒绝。如果你的部署预期每个会话有许多 SSE 订阅者，请将其与 `--max-sessions` 一起调高。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--event-ring-size <n>`                 | `8000`          | 每个会话的 SSE 重放环形缓冲区深度（#3803 §02 目标）。设置 `GET /session/:id/events` 配合 `Last-Event-ID: N` 可用的积压量。值越大 = 重连余量越多，代价是每个会话多消耗几百 KB 的 RAM。SDK 客户端还可以通过 `?maxQueued=N`（范围 `[16, 2048]`，默认 256）为特定订阅请求更大的每订阅者积压上限。守护进程还会在队列填充达到 75% 时发出非终止的 `slow_client_warning` SSE 帧，以便客户端在被驱逐前进行排空/重连。预检 `caps.features.slow_client_warning`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-client-budget <n>`               | —               | **每个 ACP 会话**的活跃 MCP 客户端正整数上限（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14 v1；PR 23 通过共享 MCP 池将其升级为每个工作区）。与 `--mcp-budget-mode` 结合使用。未设置时，不进行基于计数的强制执行（但 `GET /workspace/mcp` 仍会报告 `clientCount`）。不同于 claude-code 的 `MCP_SERVER_CONNECTION_BATCH_SIZE`（后者限制启动并发，而非总客户端数）。预检 `caps.features.mcp_guardrails`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-budget-mode <m>`                 | `warn` / `off`  | `--mcp-client-budget` 的执行方式。`warn`（设置 budget 时的默认值）：不拒绝，当达到 budget 的 ≥75% 时，快照的 `budgets[0].status` 翻转为 `warning`。`enforce`：拒绝超过上限的连接，每个 server 的单元格显示 `disabledReason: 'budget'`，由 `mcpServers` 的声明顺序决定。`off`（未设置 budget 时的默认值）：纯可观测性。如果没有设置 budget，启动时会拒绝 `enforce`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--http-bridge`                         | `true`          | 阶段 1 模式：每个守护进程一个 `qwen --acp` 子进程（在启动时绑定到一个工作区，根据 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02）；N 个会话通过 ACP `newSession()` 多路复用到该子进程上。阶段 2 的原生进程内模式将在后续提供。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--allow-origin <pat>`                  | —               | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。浏览器 webui 客户端的跨域白名单。可重复。每个值为 `*`（任意 origin —— 如果未配置 bearer token 则拒绝启动；建议在环回地址上使用 `--require-auth`，以便 `/health` 和 `/demo` 也受 bearer token 保护，因为默认情况下两者在环回地址上是预认证的）或规范的 URL origin（`<scheme>://<host>[:<port>]`，无尾部斜杠 / 路径 / 用户信息 / 查询参数）。**故意不支持子域名通配符（`https://*.example.com`）** —— 请显式列出每个子域名，或者使用 `*` 并配置 token（以及使用 `--require-auth` 进行完全加固）。匹配的 origin 会收到 CORS 响应头（`Access-Control-Allow-Origin`、`Vary: Origin`、methods、headers、max-age 以及暴露的 `Retry-After`）；不匹配的 origin 仍会收到 403，并带有与当前 wall 相同的信封。`Origin: null`（沙箱 iframe、file:// 文档）总是被拒绝，即使在 `*` 下也是如此。通过 `caps.features.allow_origin` 进行预检。环回地址自身的 origin 命中不受影响。 |
| `--web` / `--no-web`                    | `true`          | 在守护进程根目录提供构建好的 Web Shell SPA（`GET /`、`/assets/*` 以及 SPA 深度链接回退）。静态 shell 注册在 bearer 认证网关**之前** —— 浏览器无法将 token 附加到 `<script>` 子资源或地址栏导航，shell 不携带任何机密，并且每个 API 路由无论如何都受 token 保护。在非环回地址绑定时，stderr 会输出一行警告，提示 UI 可在无认证的情况下访问。对于纯 API 守护进程，请使用 `--no-web`。当构建时省略了 Web Shell 资源时，此参数无效（守护进程会记录一条 breadcrumb 并以纯 API 模式运行）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--open`                                | `false`         | 监听器启动后，在默认浏览器中打开守护进程 URL 处的 Web Shell（如果配置了 token，则会在 URL 片段中追加 `#token=` —— 片段永远不会发送到服务器，从而避免 token 出现在访问日志和 Referer 头中）。如果使用 `--no-web`，或者在没有浏览器的无头 / CI / SSH 环境中，则此操作无效。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
> **调整负载参数。** `--max-sessions` 是 **new-child** 的上限。
> 另外三个层级也会限制负载——在为高并发部署调整大小时，请将它们一起调优：
>
> - **listener 层级**：`--max-connections` / `server.maxConnections=256`
>   限制原始 TCP 连接数（慢速客户端背压）。
> - **每个 session 的 subscriber**：EventBus 默认将每个 session 的 SSE subscriber 上限
>   设为 64；第 65 个客户端会收到终端
>   `stream_error` 并被关闭。
> - **每个 session 的 prompt 准入**：
>   `--max-pending-prompts-per-session=5` 限制单个 session 接受的排队 + 活跃 prompt
>   数量。溢出会返回 `503` 及 `Retry-After: 5`。
> - **每个 subscriber 的 backlog**：每个 SSE 客户端 256 个 frame 的队列；
>   超容量的客户端会收到终端 `client_evicted` frame 并
>   被关闭（一个慢速消费者无法拖垮 daemon）。
>
> 这些上限会相互影响：`--max-sessions × 64 个 subscriber × 256 个 frame`
> 是 EventBus 层最坏情况下的内存中占用，而
> `--max-sessions × --max-pending-prompts-per-session` 限制准入层接受的
> prompt 工作量。默认大小假设是单用户/小团队负载；对于多租户
> 部署，请逐步提高（并观察 RSS）。

> **MCP client 防护栏（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** 如果在 `mcpServers` 中声明了 30 个 MCP server，workspace 将启动 30 个 client，除非你设置了上限，否则没有上游限制。`--mcp-client-budget=N` 限制活跃的 MCP client 数量；`--mcp-budget-mode={enforce,warn,off}` 选择行为模式。设置 budget 时默认为 `warn`（快照会显示警告，但不会拒绝任何 client——在开启强制执行之前，这对于测量实际扇出很有用）。在 `enforce` 模式下被拒绝的 server 会在其 per-server cell 中获得 `disabledReason: 'budget'`，并且 `budgets[0]` cell 会显示 `status: 'error'` + `errorKind: 'budget_exhausted'`。Slot 预留按 server 名称进行，并在重连/发现超时后保留——被拒绝的 server 无法从健康的 server 那里抢占 slot。
>
> ⚠️ **v1 范围：per-session，而非 per-workspace。** daemon 内部的每个 ACP session 都有自己的 `Config`/`McpClientManager`（通过 `newSessionConfig` 为每个 session 创建）。budget 限制的是**每个 session** 的活跃 MCP client 数量，而不是跨 workspace 中所有 session 的聚合数量。`GET /workspace/mcp` 处的快照反映了 bootstrap session 的视图（该 cell 带有 `scope: 'session'` 以保证准确性）。如果你运行 5 个并发的 ACP session 且 `--mcp-client-budget=10`，daemon 中最多可能有 50 个活跃的 MCP client——上限是按 session 保持的。**Wave 5 PR 23（共享 MCP pool）** 引入了 workspace 范围的 manager，并将其升级为真正的 per-workspace 强制执行。
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # 稍后，当 telemetry 显示你的实际分布后：
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> 这与 claude-code 的 `MCP_SERVER_CONNECTION_BATCH_SIZE`（控制启动并发）**不**是一回事；它们是正交的。PR 23 将添加一个真正的共享 MCP pool（在 `budgets[]` 中 alongside per-session cell 添加一个 `scope: 'workspace'` cell）；PR 14 v1 是现有 per-session manager 上的进程内计数器 + 软强制执行。
>
> **Push events（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）。** 订阅了 `GET /session/:id/events` 的 SDK client 会在 budget 阈值被跨越时收到类型化的 frame——`mcp_budget_warning`（合成的，每次向上跨越 75% 时触发一次，并在 37.5% 时通过滞后重新武装，通过 `mcp_guardrail_events` 广播）和 `mcp_child_refused_batch`（在 `enforce` 模式下的每次发现过程中合并一次；来自 `readResource` 延迟生成拒绝的长度为 1 的 batch）。`GET /workspace/mcp` 处的快照仍然是重连后状态的 single source of truth；events 是变化边缘。在无需轮询的情况下实时构建 dashboard 时非常有用。

## 默认部署威胁模型

- **仅限 127.0.0.1** —— loopback 绑定，无需 auth。
- **`--hostname 0.0.0.0` 需要 token** —— 启动时如果没有 token 会拒绝。
- **`LOOPBACK_BINDS` 包含 IPv6** —— `::1` 和 `[::1]` 在无 token 规则下被视为 loopback。
- **Host header 白名单** —— 在 **loopback** 绑定上，daemon 会检查 `Host:` 是否匹配 `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port`（根据 RFC 7230 §5.4 不区分大小写）以防御 DNS rebinding。**非 loopback 绑定（`--hostname 0.0.0.0`）故意绕过 Host 白名单** —— 运维人员已经选择了暴露面，因此 bearer-token 网关是唯一的身份验证层；反向代理 / SNI / client cert pinning 是运维人员的责任，而不是 daemon 的责任。如果你需要在非 loopback 绑定上实现基于 Host 的隔离，请在前端代理处终止 TLS 并检查 Host。
- **CORS 默认拒绝任何浏览器 Origin** —— 返回 `403` JSON。传递 **`--allow-origin <pattern>`**（可重复，T2.4 #4514）以允许特定的浏览器 origin。每个值要么是字面量 `*`（任何 origin——如果未配置 bearer token，启动时会拒绝；对于完全加固，建议在 loopback 上开启 `--require-auth`，因为默认情况下 `/health` 和 `/demo` 在 loopback 上处于 pre-auth 状态），要么是规范的 URL origin（`<scheme>://<host>[:<port>]`，无尾随斜杠/路径/userinfo）。匹配的 origin 会收到正确的 CORS 响应头（`Access-Control-Allow-Origin: <echoed>`、`Vary: Origin`，以及标准的 methods / headers / max-age 和暴露的 `Retry-After`）；不匹配的 origin 仍会收到 403，并使用与默认墙相同的 envelope。`caps.features.allow_origin` 是有条件广播的，因此 SDK / webui client 可以在发出跨域请求之前预检 daemon 是否支持。示例：`qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`。Loopback 自身 origin 的请求（例如 `/demo` 页面）不受影响——一个单独的 Origin 剥离 shim 会处理它们，无论 `--allow-origin` 如何配置。**未配置 `--allow-origin` 的浏览器 webui** 仍会回退到与之前相同的 Stage 1 选项：打包为原生 shell（Electron/Tauri）以便不发送 `Origin` header，或者使用同源反向代理前置 daemon。
- **生成的 `qwen --acp` 子进程继承 daemon 的环境**，并进行一项显式清理：在子进程启动前移除 `QWEN_SERVER_TOKEN`（daemon 自身的 bearer；agent 不需要它）。其他所有内容——`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `QWEN_*` / `DASHSCOPE_API_KEY` / 你的自定义 `modelProviders[].envKey` / 等——都会透传，因为 agent 确实需要这些来向 LLM 进行身份验证。**这是有意为之的，不是沙箱。** agent 以相同的 UID 运行并具有 shell-tool 访问权限，因此无论怎样，`~/.bashrc` / `~/.aws/credentials` / `~/.npmrc` 中的任何内容都可以通过 prompt 注入访问。env 透传不是安全边界；用户作为 trust root 才是。不要在你不信任 agent 的具有 env 驻留凭据的身份下运行 `qwen serve`。
- **每个 subscriber 的有界 SSE 队列** —— 溢出队列的慢速 client 会收到 `client_evicted` 终端 frame 并被关闭；一个卡住的消费者无法拖垮 daemon。
- **每个 session 的 prompt 准入上限** —— 默认每个 session 接受但未解决的 prompt 数量为 5。有 bug 的 client 无法为一个 session 排队无限制的 prompt promise 或临时 SSE 等待。
- **优雅关闭** —— SIGINT/SIGTERM 会在关闭 listener 之前排空 agent 子进程（每个子进程 10 秒超时）。

> ⚠️ **Stage 1 已知缺陷 —— 权限是 daemon 全局的，而非 per-session（BUy4H）。** `pendingPermissions` 存在于 daemon 作用域；任何持有 bearer token 的 client 都可以对其能看到的任何 session 的任何 `requestId` 进行投票（并且 SSE `permission_request` events 在其 payload 中携带 requestId）。这在单用户/小团队信任模型下是可以接受的，其中每个经过身份验证的 client 都是同一个人或他们信任的协作者。Stage 1.5 将迁移到 `POST /session/:id/permission/:requestId` + session 范围的 pending map + per-client 身份（下游审查中的 must-have #3）；在此之前，不要在与不受信任方共享的 bearer 后面运行 `qwen serve`。
>
> ⚠️ **Stage 1 已知缺陷 —— `POST /session/:id/prompt` body 上限为 10 MB（BUy4L）。** 包含超过 10 MB 的图像 / PDF / 音频的多模态 prompt 将在 route 逻辑运行之前在 body 解析时失败（无流式传输，无上传中途终止）。解决方法：在客户端缩小内容，或传递路径引用并让 agent 通过 `readTextFile` 读取文件。Stage 1.5 将在 `/prompt` 上接受 `multipart/form-data` 或分块编码，以便大型 prompt 不会遇到硬限制。
>
> ⚠️ **Stage 1 已知缺陷 —— NAT 后的幽灵 SSE 连接。** daemon 通过心跳（15 秒间隔）上的 TCP 背压检测死掉的 client。一个消失而**没有** TCP RST 的 client（例如，NAT 盒子静默丢弃空闲流）将保持内核级 socket “存活”，直到 Node 的 keepalive 探测超时——在 Linux 默认设置下通常约为 2 小时。在位于此类 NAT 后面的 `--hostname 0.0.0.0` 部署中，幽灵 SSE 连接可能会累积并最终达到 256 的 `server.maxConnections` 上限。
>
> 设置 [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout)
> （issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9）
> 以通过显式的应用层空闲截止时间来弥补这一缺陷：
> 当 `n` 毫秒内没有成功 flush 任何写入时，daemon 会发出
> 一个终端 `client_evicted` frame，其
> `reason: 'writer_idle_timeout'` 并关闭流。默认情况下该标志关闭以保留旧版契约——在吞噬 RST 的网络上的运维人员应选择一个远高于 15 秒心跳间隔的值（例如 `60000`–`300000`），以便合法的空闲连接不会被驱逐，同时真正卡住的写入者会被迅速清理。从你的 SDK 预检 `caps.features.includes('writer_idle_timeout')` 以确认 daemon 支持它。

### 截止时间和 writer 空闲超时

Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 提供了两个可选标志，用于弥补 15 秒心跳 + AbortSignal 未涵盖的长时间运行/远程部署缺陷。两者默认均关闭——单用户 loopback 工作流保持完全不变。

| 标志                           | 环境变量                             | 默认值 | 作用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | 未设置   | 单个 `POST /session/:id/prompt` 的服务端挂钟时间上限。到期时，daemon 中止 prompt 的 AbortController 并返回 HTTP `504`，附带 `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`。per-prompt 请求 body 字段 `deadlineMs` 可以**缩短**有效截止时间至低于该标志的值，但绝不能延长它。能力标签（条件性）：`prompt_absolute_deadline`。                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | 未设置   | 每个 SSE 连接的空闲截止时间。当 `n` 毫秒内没有**成功** flush 任何写入（既没有真实 event，也没有 15 秒心跳）时，daemon 会发出一个终端 `client_evicted` frame，其 `data.reason = 'writer_idle_timeout'`（在 `data.errorKind` 上镜像）并关闭流。**选择一个远高于 15 秒心跳的值**（例如 `30000`–`300000`），以免合法的空闲流被驱逐；`< 15000` 的值**将**在第一次心跳触发之前驱逐原本健康的空闲连接（仅用于测试/短期开发会话）。能力标签（条件性）：`writer_idle_timeout`。 |

这两个标志都接受以毫秒为单位的正整数；`0`、`NaN`、非整数或负值会在启动时被拒绝，并显示清晰的错误消息。CLI 标志优先于环境变量；显式的 `ServeOptions` 字段（嵌入式调用者）优先于环境变量。SDK 消费者在依赖这两种行为之前应预检匹配的能力标签——早于此 PR 的 daemon 会省略这两个标签，并且请求的 `deadlineMs` 字段会被静默丢弃。

## 多 session 与多 workspace 部署

根据 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02，每个 `qwen serve` 进程在启动时绑定到**一个 workspace**。在该 workspace 内，它通过 agent 的原生 session map 将 N 个 session 多路复用到单个 `qwen --acp` 子进程上——session 共享子进程的进程 / OAuth 状态 / 文件读取缓存 / 层级记忆解析。

要托管**多个 workspace**（一个用户，多个 repo；或同一主机上的多个用户），请运行**多个 daemon 进程**——每个 workspace 一个，每个都在自己的端口上，由 systemd / docker-compose / k8s / `qwen-coordinator` 参考编排器监督。这种权衡是有意为之的：每个子进程一个 workspace 意味着 `loadSettings(cwd)` / OAuth / MCP server 范围与绑定目录保持一致，并且不会在请求之间漂移。

> **在 attach 时 posting `modelServiceId` 之前先 Subscribe。** 当 client `POST /session` 带有 `modelServiceId` 且 workspace 已经有一个运行不同模型的 session 时，daemon 会发出内部 `setSessionModel` 调用——失败**不会**作为 HTTP 错误传播（session 在其当前模型上保持运行）。可见的失败信号是 session 的 SSE 流上的 `model_switch_failed` event。如果你调用 `POST /session` 并**仅在那之后**打开 `GET /session/:id/events`，你将错过失败 event 并静默地继续与错误的模型对话。先打开 SSE 流，或者在 subscribe 时传递 `Last-Event-ID: 0` 以重播 ring 中最老的可用 event。

要处理多个**用户**（每个用户都有自己的配额、审计日志、沙箱）或扩展到超出单个进程的范围（冷启动预算、FD 数量、RSS），请在外部编排器后面为每个用户的每个 workspace 生成一个 daemon。该编排器（多租户 / OIDC / 配额 / 审计 / k8s）**不在** qwen-code 项目的范围内——请参阅 issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) “External Reference Architecture” 以获取设计指针。

## 加载和恢复持久化 session

daemon 通过两条路由在 HTTP 上暴露 ACP 的 `session/load` 和 resume 流程：

| 路由                      | 使用场景                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`   | 客户端**没有**渲染任何历史记录（冷重连，先选择后打开）。daemon 通过 SSE 重播每个持久化的 turn，以便订阅者看到完整的对话记录。能力标签：`session_load`。                                                                                        |
| `POST /session/:id/resume` | 客户端已经在屏幕上显示了 turns，只需要 daemon 端的句柄。模型上下文在 agent 端恢复，无需 UI 重播——SSE 流保持干净。能力标签：`session_resume`（`unstable_session_resume` 仍然是旧客户端的已弃用别名）。 |

TypeScript SDK 将两者作为 `DaemonSessionClient` 上的静态工厂暴露：

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// 冷重连 —— daemon 将通过 SSE 重播历史记录。
const session = await DaemonSessionClient.load(client, 'persisted-id');

// 或者，如果你的 UI 已经有历史记录，跳过重播：
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // 首先是重播的 `session_update` frames（仅限 load），
  // 然后是实时 events。
}
```

在调用前预检 `caps.features.session_load` / `caps.features.session_resume`——旧版 daemon 会返回 `404`。`unstable_session_resume` 仍然作为已弃用的兼容性别名被广播。对同一 id 的并发相同操作请求会合并；跨操作竞争（`load` 与 `resume` 竞争）会得到 `409 restore_in_progress` 及 `Retry-After: 5`。有关完整的错误 envelope，请参阅[协议参考](../developers/qwen-serve-protocol.md)。

注意：历史重播受 SSE ring 限制（默认 8000 个 frames）。具有大量对话的长历史记录可能会超过该限制——最早的 frames 会被静默丢弃。对于非常长的 session，建议使用 `resume` 并依赖客户端本地持久化的 UI。

## 持久性模型

**在 Stage 1 中，session 在 daemon 重启时仍然是短暂的**，但磁盘上持久化的 session 可以重新加载：

- 子进程崩溃会发布 `session_died` 并从 daemon 的 maps 中移除 live session。如果可以生成新的 agent 子进程，则可以通过 `POST /session/:id/load` 重新加载磁盘上持久化的 session。
- daemon 重启会丢失所有进行中的 live session。持久化的 session 保留在磁盘上，可以针对新的 daemon 进程加载，并遵循相同的 workspace 绑定规则。
- 长时间的客户端断开连接（在对话密集的 turn 上 >5 分钟）可能会超出 SSE 重播 ring（默认 8000 个 frames）—— `Last-Event-ID` 重连成功，但状态可能不一致。对于移动设备/网络不稳定的客户端，计划在长时间断开时重新打开 SSE，或调用 `POST /session/:id/load` 从磁盘重播。
- 文件操作（`writeTextFile`）在崩溃时是原子的（先写后重命名）；它们在 daemon 重启时不是原子的（就重播而言）——文件写入要么成功，要么失败。

如果你的集成需要超出 `session/load` 涵盖范围的服务端跨重启持久性（例如，服务端管理的重试队列），你仍然需要应用级别的状态恢复。不要在 daemon 的 session 中保留长时间运行、对重启敏感的状态。

## Stage 1.5+ 运行时保证

Stage 1 的契约是为原型设计而设定的。根据 [#3889 chiga0 downstream-consumer review](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644)，以下内容**不在** Stage 1 中——生产级集成在依赖它们之前需要 Stage 1.5+：
**正式下游使用的关键阻碍：**

1. **通过 HTTP 实现 `loadSession` / `unstable_resumeSession`** —— 如果没有此功能，任何集成都无法在子进程崩溃或守护进程重启后存活，协调守护进程的编排器也无法恢复状态。
2. **持久化客户端身份（配对 token + 按客户端撤销）** —— 第一阶段使用一个共享的 bearer token；泄露的 token 会导致所有客户端被撤销，且 `originatorClientId` 是客户端自行声明的，而不是由守护进程基于已认证身份注入的。

**可靠性基线：**

3. ~~**客户端发起的心跳路径**~~ —— 已通过 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 9 发布。`POST /session/:id/heartbeat` 在守护进程上记录最后可见时间戳（能力标签 `client_heartbeat`）；SDK 辅助方法为 `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`。
4. 当投票在首个响应者竞争中失败时触发 **`permission_already_resolved` 事件** —— 目前 UI 必须从 `404` 推断状态。
5. ~~**更大的重放环（replay ring）**~~ —— 已提升至 8000。**按会话配置的重放环** 仍待解决 —— 移动端/多轮对话工作负载可能需要按会话覆盖配置。
6. 在 `client_evicted` 之前触发 **`slow_client_warning` 事件** —— 提供软反压，使表现良好的慢速客户端在被终止前能够自我限流（裁剪渲染深度、丢弃数据块）。

**集成易用性：**

7. **用于 IM 风格上下文的 `POST /session/:id/_meta`** —— 附加到后续提示的按会话键值对（聊天 ID、发送者、线程 ID）取代了按通道的临时拼凑方案。
8. **`/capabilities` 实际特性协商** —— `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }`，以便客户端能够检测到偏差，而不是直接回退到“未知帧，忽略”。
9. **一等公民的持久化文档**（本节） —— 已在上方发布。

完整的融合路线图在 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) 中跟踪。

## 第一阶段范围边界 —— 我们在第一阶段 1.5 中不会修复的问题

有两个结构性选择被明确列为第一 / 1.5 / 2 阶段主线路线图的非目标。如果你的用例依赖于其中任何一个，请围绕它们进行规划，而不是等待我们。

### 会话状态仅限本地修改（根据 [LaZzyMan review #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721)）

第一阶段 1.5 计划将 TUI 描述为进程内 EventBus 订阅者。实际上，**TUI UI 严格大于线路协议（wire protocol）**：

- **仅限本地的 UI** —— 约 15 个 Ink 对话框组件（`ModelDialog`、`MemoryDialog`、`PermissionsDialog`、`SessionPicker`、`WelcomeBackDialog`、`FolderTrustDialog` 等）以及 `local-jsx` 斜杠命令（`/ide`、`/auth`、`/init`、`/resume`、`/rename`、`/delete`、`/language`、`/arena` 等）渲染特定于终端的 Ink JSX。通过 HTTP/SSE 连接的远程客户端无法等效渲染 Ink，且这些流程不会发出线路事件。
- **没有线路事件的会话状态修改** —— `/approval-mode`、`/memory add`、`/mcp add-server`、`/agents`、`/tools enable/disable`、`/auth`、`/init`（写入 `CLAUDE.md`）都会改变代理行为，但目前只有 `/model` 会发布事件（`model_switched`）。

**第一阶段的选择 —— 评审中的选项 (A)**：不将这些修改提升为线路事件。这两种部署模式会产生不同的后果。

#### 模式 1 —— 无头 `qwen serve`（本 PR）

守护进程内部没有运行 TUI shell。上述列出的斜杠命令在此模式下**不存在** —— 因为没有终端 UI 来发出它们。因此，会话状态是：

- **启动时冻结** 的 `approval-mode` / `memory` / `agents` / `tools` 允许列表 / `auth` —— 当守护进程的 `qwen --acp` 子进程启动时，全部从设置和磁盘加载；在会话生命周期内不可变。设置中定义的 MCP 服务器同样在启动时冻结，但**运行时添加的服务器**（通过 `POST /workspace/mcp/servers`）可以在不重启的情况下添加或删除。
- **可通过 HTTP 修改**，通过 `POST /session/:id/model`（发布 `model_switched`）、`POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name`（发布 `mcp_server_added` / `mcp_server_removed`），以及权限投票（`POST /permission/:requestId`）。

**后果：** 无头模式下的远程客户端可以看到**完整的会话状态**。没有 TUI 隐藏额外状态；不可能出现状态漂移。如果你想更改 `approval-mode`，请使用新设置重启守护进程。MCP 服务器现在可以通过修改路由（`POST /workspace/mcp/servers`、`DELETE /workspace/mcp/servers/:name`）在运行时添加/删除 —— 请参阅[运行时 MCP 服务器管理](#runtime-mcp-server-management-issue-4514)。

#### 模式 2 —— 第一阶段 1.5 `qwen --serve` 协同托管 TUI（不在本 PR 中）

当第一阶段 1.5 落地 `qwen --serve`（TUI 进程协同托管同一个 HTTP 服务器）时，TUI **确实**与远程客户端并存。本地操作员输入 `/approval-mode yolo` 或 `/mcp add-server` 会修改会话状态，而 HTTP 上的远程客户端没有事件可以观察到此更改。

在此模式下，TUI 是一个 **“超级客户端”** —— 它观察远程客户端看到的相同代理对话，并且可以修改远程客户端无法修改的会话状态。这种不对称性体现在：

- ✅ TUI 和远程客户端都能看到相同的代理消息、工具调用、文件差异和权限提示。
- ❌ 只有 TUI 能看到/修改 approval-mode / memory / MCP 服务器列表 / agents / tools 允许列表 / auth 状态。

**模式 2 的后果：** 如果远程客户端 UI 尝试镜像会话设置，它在任何 TUI 斜杠命令后都可能出现状态漂移。远程客户端应在**附加/重新连接时重新获取状态**（使用 `Last-Event-ID: 0` 重放环中最旧的事件，例如 `model_switched`）；它们**不应**依赖增量事件来处理 TUI 端的修改。

#### 为什么选择 (A) 而不是 (B)（将修改提升为 `session_state_changed` 事件族）

(B) 是更具野心的答案，但会将第一阶段 1.5 锁定在一个大得多的线路表面上，且该表面还必须干净地通过计划中的进程内重构。我们宁愿诚实地走较小的范围。会话状态事件分类工作 —— 列举哪些 TUI 流程在设计上仅限本地，哪些可以在未来选择加入的 (B) 风格扩展中合理地升级为线路事件 —— 将移至 [#3803](https://github.com/QwenLM/qwen-code/issues/3803)，而不是第一阶段 1.5 代码中。

### N 个并行会话共享一个 `qwen --acp` 子进程

同一工作区上的多个会话通过代理的原生多会话支持（`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`）**共享一个 `qwen --acp` 子进程**。桥接器为每个会话调用 `connection.newSession({cwd, mcpServers})` —— 代理将它们存储在其会话映射中，并按调用解复用 sessionId。

在同一工作区上 N=5 个会话的具体开销：

| 资源                             | 每会话 | N=5 时                       |
| ------------------------------------ | ----------- | ---------------------------- |
| Daemon Node 进程                  | 一个         | **30–50 MB**（一个守护进程）    |
| `qwen --acp` 子进程                   | 共享      | **60–100 MB**（一个子进程）    |
| MCP 服务器子进程                  | 按会话 | 如果配置不同则为 3×N        |
| `FileReadCache`（子进程堆内）      | 共享      | 解析一次                  |
| `CLAUDE.md` / 层级记忆解析 | 共享      | 解析一次                  |
| OAuth 刷新 token 状态            | 共享      | **一条刷新路径**         |
| 自动记忆学习到的事实            | 共享      | 每个子进程一个知识库 |
| 冷启动                           | 仅首次  | 首个会话后 <200 ms  |

桥接器保持**每个守护进程一个通道**（每个工作区一个守护进程，参见 §02）。只要至少有一个会话处于活动状态，通道就会保持活动；最后一个 `killSession`（或通道级崩溃）会终止子进程。

今天，**MCP 服务器子进程**仍然是按会话的 —— 每个会话的配置可以指定不同的服务器，因此它们是独立生成的。第一阶段 1.5 后续：通过 `(workspace, config-hash)` 对 MCP 服务器子进程进行引用计数，以便相同配置可以共享。不在本 PR 范围内。

**对等代理（Cursor / Continue / Claude Code / OpenCode / Gemini CLI）都采用单进程多会话模式。** qwen-code 在代理层与它们匹配；本 PR 中的第一阶段桥接器使相同的架构在 HTTP 上可见。

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

**守护进程绝不会代你打开浏览器。** 即使在本地运行，守护进程也保持被动 —— 它返回 URL 并让 SDK/用户选择在哪里打开它。这是有意为之：在无头 pod 上调用 `xdg-open` 的守护进程会静默失败，从而掩盖了实际的 auth 表面。在你的客户端中模仿 `gh auth login` 的“按 Enter 键打开浏览器”UX。

**`--require-auth` 与开发便利性。** 设备流路由使用严格的修改门控（PR 15），这意味着无 token 的环回默认设置会返回 `401 token_required`。在本地开发期间，解决此问题的最简单方法是 `qwen serve --token=dev-token`；除非你要加固环回默认设置，否则不需要 `--require-auth`。

**跨守护进程限制。** `oauth_creds.json` 是守护进程共享的（`~/.qwen/oauth_creds.json`），因此在守护进程 A 中成功登录会被守护进程 B 的下一次 token 刷新自动获取 —— 但守护进程 B 的 SDK 客户端不会收到 `auth_device_flow_authorized` 事件（事件是按守护进程隔离的）。

**跨客户端接管。** 同一守护进程上的两个 SDK 客户端如果都针对同一提供程序 `POST /workspace/auth/device-flow`，将获得按提供程序隔离的单例：第一次调用启动全新的 IdP 请求并返回 `attached: false`；第二次调用返回**现有**的进行中条目，且 `attached: true`。接管操作会记录在审计跟踪中（在第二个客户端的 `X-Qwen-Client-Id` 下），但**不会**发出单独的事件 —— 一旦用户完成 IdP 页面，两个客户端最终都会观察到**相同的** `auth_device_flow_authorized`。如果你的 UI 区分“我发起了这个”和“我加入了别人的流程”，请根据 `start()` 返回的 `attached` 字段进行分支处理。

## 守护进程日志文件

`qwen serve` 将每个进程的诊断日志写入：

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log
```

同一目录中的 `latest` 符号链接始终指向当前进程的日志，因此 `tail -f ~/.qwen/debug/daemon/latest` 将跟踪正在运行的任何守护进程。

日志捕获生命周期消息、路由错误（带有 `route=` 和 `sessionId=` 上下文）、ACP 子进程 stderr，以及 —— 当设置 `QWEN_SERVE_DEBUG=1` 时 —— 额外的桥接面包屑。今天输出到 stderr 的行仍然输出到 stderr；文件日志是**附加的**，而不是替代。

### 禁用

设置 `QWEN_DAEMON_LOG_FILE=0`（或 `false`/`off`/`no`）以完全跳过文件日志记录。Stderr 输出不受影响。

### 与会话调试日志的关系

会话范围的调试日志（`~/.qwen/debug/<sessionId>.txt` 和 `~/.qwen/debug/latest` 符号链接）是独立的。守护进程日志位于同级的 `daemon/` 子目录中；此功能不会改变按会话调试的语义。

### 无轮转

守护进程日志会无限追加。如果变得太大，请手动轮转。未来的增强功能可能会添加自动轮转；请通过 [#4548](https://github.com/QwenLM/qwen-code/issues/4548) 后续跟踪。

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