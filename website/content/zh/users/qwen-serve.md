# 守护进程模式（`qwen serve`）

将 Qwen Code 以本地 HTTP 守护进程方式运行，使多个客户端（IDE 插件、Web UI、CI 脚本、自定义 CLI）共享一个代理会话，通过 HTTP + 服务器发送事件（Server-Sent Events）进行通信，而无需每个客户端都启动自己的子进程。

> **🚧 v0.16-alpha**：`qwen serve` 首次随 v0.16-alpha 发布到 npm，提供**纯文本聊天/编码**功能，并支持**仅本地部署**。提示路径上的图片/文件附件、容器化部署（Docker/k8s/nginx 反向代理）以及远程/多守护进程加固将在后续补丁中发布，届时将有企业试点项目参与。请参阅 [v0.16-alpha 已知限制](#v016-alpha-已知限制) 获取完整的延期列表。

> **状态：** 第一阶段（实验性）。协议接口已在第 3803 号 issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) 的 §04 路由表中锁定。第一阶段 1.5（`qwen --serve` 标志——TUI 与同一 HTTP 服务器共存）和第二阶段（进程内重构 + `mDNS`/OpenAPI/WebSocket/Prometheus 优化）将紧随其后。
>
> **范围诚实说明：** 第一阶段的范围适用于**开发者针对协议接口进行客户端原型开发**，以及**本地单用户/小团队协作**。生产级的多客户端/长时间运行/网络不稳定的工作负载（移动端伴侣、IM 机器人处理 1000+ 对话）需要第一阶段 1.5+ 的保障，本版本不包含这些功能。请参阅 [第一阶段 1.5+ 运行时保障](#第一阶段-15-运行时保障) 获取完整的差距列表，以及第 #3803 号 issue 了解汇聚路线图。

## 它能为你带来什么

- **内置 Web Shell UI** — `qwen serve` 默认在其根路径（`http://127.0.0.1:4170/`）提供基于浏览器的 Web Shell；运行 `qwen serve --open` 可在浏览器中自动启动它。它与 API 同源，因此无需额外端口或反向代理。传递 `--no-web` 可仅运行 API 守护进程。
- **一个代理进程，多个客户端** — 在默认的 `sessionScope: 'single'` 下，每个连接到守护进程的客户端共享一个 ACP 会话。实现跨客户端实时协作，共享同一对话、同一文件差异、同一权限提示。
- **断线重连安全的流式传输** — 支持带有 `Last-Event-ID` 的 SSE 重连，客户端可以断开连接后从上次中断处继续（在环形缓冲区的重放窗口内）。
- **先应答者权限** — 当代理请求运行某个工具的权限时，每个连接的客户端都能看到该请求；最先应答的客户端决定结果。
- **一个守护进程，一个工作区** — 每个 `qwen serve` 进程在启动时绑定到**一个**工作区（根据 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02）。多工作区部署时，每个工作区运行一个守护进程，使用不同端口（或在编排器后面）。
- **远程运行时控制**（[#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17）— 更改会话的审批模式（`POST /session/:id/approval-mode`）、按工作区切换工具启用状态（`POST /workspace/tools/:name/enable`）、创建一个空的 `QWEN.md`（`POST /workspace/init`，仅机械操作——不调用模型；如需 AI 填充，后续调用 `POST /session/:id/prompt`）、在预算预检查后重启单个 MCP 服务器（`POST /workspace/mcp/:server/restart`），或在无需重启守护进程的情况下添加/删除 MCP 服务器（`POST /workspace/mcp/servers`，`DELETE /workspace/mcp/servers/:name`）。所有操作均受严格门控——需先配置 `--token`。
- **会话摘要**（[#4175](https://github.com/QwenLM/qwen-code/issues/4175) 后续）— 获取活动会话的一句话摘要“我从哪里离开”（`POST /session/:id/recap`）。封装核心的 `generateSessionRecap`，作为对快速模型的侧查询；既不会污染主聊天历史，也不会干扰 SSE 流。非严格门控（与 `/prompt` 相同状态）；SDK 辅助方法 `client.recapSession(sessionId)`。
  - **已知限制——令牌成本放大：** 该路由是纯成本端点（每次调用都是 LLM 侧查询，无状态收益），且守护进程在 v1 中没有按路由的速率限制。在无令牌循环回环默认配置下，一个错误或恶意的本地客户端可以滥发此路由以消耗令牌。在暴露守护进程之前，请在共享开发主机上配置 `--token`（以及可选的 `--require-auth`）。
  - **并发摘要安全：** 对同一会话的两个同时 `/recap` 调用将运行两个独立的侧查询。`generateSessionRecap` 通过 `GeminiClient.getChat().getHistory()` 读取聊天历史的快照，并将其传递给单独的 `BaseLlmClient.generateText` 调用（通过 `runSideQuery`）；它从不追加或修改会话的 `GeminiChat`。多个客户端无需协调即可安全调用。

## v0.16-alpha 已知限制

`qwen serve` 的首次 npm 发布（v0.16-alpha）有意保持范围狭窄——仅提供纯文本聊天/编码，适用于开发者在自己的机器上运行守护进程。下面的列表明确了延期的功能范围，以便采用者可以提前规划；所有这些内容都在 v0.16.x 补丁路线图或近期后续版本中。

**产品功能——纯文本：**

- ✅ 文本提示和文本响应（聊天、编码、工具调用、MCP 集成）
- ❌ **提示路径上的图片/文件附件** — `MessageEmitter` 目前仅渲染文本；当有图片需求的 alpha 目标确定后，多模态回显功能将落地（#4175 chiga0 #27 P0 项）
- ❌ **流式上传** — 与多模态相同的门控条件

**部署方式——仅本地：**

- ✅ 回环地址（`127.0.0.1`，默认）— 无需认证，适用于开发工作站
- ✅ 通过 `systemd`/`launchd`/`nohup &`/`tmux` 本地启动 — 参见 [本地启动模板](./qwen-serve-deploy-local.md)
- ✅ 通过 `QWEN_SERVER_TOKEN` 环境变量自带 bearer 令牌（[认证](#认证) 部分说明设置方法）
- ❌ **容器化部署** — Docker/Compose/Kubernetes/带 TLS 终止的 nginx 反向代理在 v0.16-alpha 中不支持。推迟到 v0.16.x，一旦企业试点项目确定后（否则会因无人验证而腐烂）。
- ❌ **单主机上的多守护进程协调** — 强制 `1 个守护进程 = 1 个工作区 × N 个会话`。跨主机联邦、实例路径令牌键控和过期令牌清理推迟到 v0.16.x。
- ❌ **自动生成的守护进程令牌** — alpha 版本需要自带令牌（只需一条 `openssl rand -hex 32` 命令）。自动生成 + 令牌存储基础设施推迟到 v0.16.x。

**加固——本地单用户的最低可用方案：**

- ✅ 启动时安全门控（拒绝无令牌的非回环绑定，[PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236)）
- ✅ 变更路由认证门控、会话范围权限路由（Wave 4 PRs）
- ✅ MCP 护栏 + 多客户端权限协调（F2 / F3）
- ✅ **提示绝对截止时间 + SSE 写入器空闲超时** — 通过 `--prompt-deadline-ms` 和 `--writer-idle-timeout-ms` 可选启用；启用后通过 `prompt_absolute_deadline` 和 `writer_idle_timeout` 公布。
- ✅ **HTTP 速率限制** — 通过 `--rate-limit` 和按层级阈值可选启用；启用后通过 `rate_limit` 公布。
- ⏸️ **Prometheus 指标 + 负载测试工具** — 推迟到 v0.17 F4 第一阶段规模检测，届时以 30-50 个活动会话为实际目标。
- ⏸️ **`--max-body-size` CLI 标志** — 守护进程默认强制 `express.json({ limit: '10mb' })`，这足以覆盖纯文本提示（模型上下文窗口远低于 10 MiB 字符数）。可在 v0.16.x 中通过标志进行调整。

有关“我们不会在第一阶段修复的内容”的更深入枚举（单主机会话状态变更模型 + N 个并行会话共享一个 ACP 子进程），请参见下面的[第一阶段范围边界](#第一阶段范围边界--第一阶段-15-不会修复的内容)。

## 快速入门

### 1. 启动守护进程（回环地址，无认证）

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

默认绑定地址为 `127.0.0.1:4170`。回环地址上 bearer 认证**关闭**，以便本地开发“开箱即用”。守护进程绑定到当前工作目录；使用 `--workspace /path/to/dir` 覆盖。

**打开 Web Shell UI。** 浏览 `http://127.0.0.1:4170/`（或使用 `qwen serve --open` 自动启动守护进程）即可获得完整的浏览器终端——聊天、差异、工具调用和权限提示。UI 在守护进程根路径上与 API 同源提供。本指南的其余部分使用原始 HTTP，以便您可以直接通过脚本调用 API。

### 2. 快速检查

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

`workspaceCwd` 字段显示绑定的工作区，客户端可以预先检查并在 `POST /session` 中省略 `cwd`。
`limits.maxPendingPromptsPerSession` 字段公布每个会话的活动提示准入上限；`null` 表示上限已禁用。

守护进程还公开了只读运行时快照，供客户端 UI 和操作员使用：`GET /daemon/status`、`GET /workspace/mcp`、
`GET /workspace/skills`、`GET /workspace/providers`、`GET /workspace/env`、
`GET /workspace/preflight`、
`GET /session/:id/status`、`GET /session/:id/context`、
`GET /session/:id/supported-commands` 和
`GET /session/:id/tasks` 以及 `GET /session/:id/lsp`。

`GET /session/:id/status` 返回单个会话的实时桥接摘要：
`sessionId`、`workspaceCwd`、`createdAt`、可选的 `displayName`、`clientCount`
和 `hasActivePrompt`。如果守护进程持有该 id 的实时会话，则返回 `200` 及摘要；
否则返回 `404`（正文 `{ "error": …, "sessionId": … }`）。您可以使用它来轮询某个已知会话是否仍在运行
（`hasActivePrompt`）或有多少客户端连接（`clientCount`），而无需获取并扫描整个分页会话列表：

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

这是原始的实时会话视图，因此 `clientCount` 和 `hasActivePrompt` 与
`GET /workspace/:id/sessions` 中的相应条目匹配——但这两个路由并非字节完全一致。
列表端点用持久化的会话存储数据丰富了每个条目：其 `createdAt` 是持久化的首次提示时间，
并添加了 `updatedAt` 以及从存储标题或首次提示派生的 `displayName`。
`/status` 则报告实时会话自身的 `createdAt`，省略 `updatedAt`，
并且仅在实时会话设置了 `displayName` 时才返回。

`GET /session/:id/lsp` 返回结构化的每个会话 LSP 状态。使用 `--experimental-lsp` 启动
守护进程以在生成的代理会话中启用 LSP；否则该路由返回 `enabled: false` 且无服务器。

`GET /daemon/status` 是综合故障排除快照。默认的
`detail=summary` 仅读取内存中的守护进程状态（会话、权限、
SSE/ACP 传输计数、速率限制拒绝、进程内存、已解析的限制）
并且不启动 ACP 子进程。在主动排查问题时，使用 `GET /daemon/status?detail=full` 获取
每个会话的诊断信息、ACP 连接详情、认证设备流计数
以及工作区状态部分。

`GET /workspace/mcp`、`GET /workspace/skills` 和 `GET /workspace/providers`
报告实时 ACP 运行时，并且在空闲时不启动 ACP 子进程；
空闲守护进程返回 `initialized: false` 及空快照。一旦会话
处于活动状态，它们将切换为 `initialized: true` 并显示真实状态。

`GET /workspace/env` 和 `GET /workspace/preflight` 无论 ACP 状态如何始终回答
`initialized: true`。`env` 从不查询 ACP（仅守护进程进程信息）；
`preflight` 回答来自 `process.*` 的守护进程级别单元格，并在子进程空闲时
为 ACP 级别单元格发出 `status: 'not_started'` 占位符。

`GET /workspace/env` 报告守护进程进程的运行时、平台、沙箱、
代理以及白名单 secret 环境变量（如 `OPENAI_API_KEY`）的**存在性**（从不输出值）。代理 URL 在传输前会剥离凭证并简化为 `host:port`。该路由始终直接从守护进程进程回答，从不生成 ACP 子进程。

`GET /workspace/preflight` 返回就绪检查列表。**守护进程级别单元格**（Node 版本、
CLI 入口、工作区目录、ripgrep、git、npm）始终渲染。**ACP 级别单元格**（认证、
MCP 发现、技能、提供者、工具注册表、出站访问）需要实时 ACP 子进程——当守护进程空闲时
它们会发出 `status: 'not_started'` 占位符，而不是为了填充它们而生成 ACP。
失败映射到一个封闭的 `errorKind` 枚举（`missing_binary`、`auth_env_error`、
`init_timeout`、`protocol_error`、`missing_file`、`parse_error`、
`blocked_egress`），以便客户端 UI 可以渲染结构化的修复建议。

守护进程还公开了工作区文件辅助方法：

- `GET /file` 读取文本文件并返回原始字节的 `sha256:<hex>` 哈希。
- `GET /file/bytes` 读取有界原始字节窗口并返回 base64 内容。
- `POST /file/write` 创建或替换文本文件。
- `POST /file/edit` 应用一次精确文本替换。

写/编辑是**严格的变更路由**：即使在回环地址上，也需要配置的 bearer 令牌，否则返回 `token_required`。替换和编辑需要来自 `GET /file`（或全窗口 `GET /file/bytes`）的最新 `expectedHash`。`create` 从不覆盖。对忽略路径的显式写入是允许的但会进行审计。二进制写入、删除/移动/创建目录和递归父目录创建不在此接口范围内。

### 3. 打开一个会话

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` 可以省略——路由会回退到守护进程绑定的工作区。如果提交的 `cwd` 与绑定的工作区不匹配，则返回 `400 workspace_mismatch`（守护进程仅绑定到一个工作区；如需不同的工作区，请启动单独的守护进程）。

第二个客户端提交 `/session`（任何匹配的 `cwd` 或无）会得到 `"attached": true`——他们现在共享同一个代理。

### 4. 订阅事件流（首先在另一个终端中）

```bash
SESSION_ID="<来自步骤 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

`data:` 行是**完整的事件信封**——`{id?, v, type, data, originatorClientId?}`——以 JSON 字符串形式放在单行上。ACP 载荷（此示例中的 `sessionUpdate` 块）位于该信封的 `data` 下。SSE 级别的 `id:`/`event:` 行是为 EventSource 客户端提供的便利；相同的值也出现在 JSON 信封内部，因此原始 `fetch` 消费者也能获取到。

在**发送提示之前**打开此订阅——SSE 重放缓冲区会保存最近的 8000 个事件，因此晚订阅的客户端可以通过 `Last-Event-ID` 追赶，但对于简单的“观察单个提示”场景，最简单的做法是先订阅并让它实时流式传输。

流会发出 `session_update`（LLM 分块、工具调用、使用量）、
`permission_request`（工具需要批准）、`permission_resolved`
（有人投票了）、`model_switched`、`model_switch_failed` 以及终止帧
`session_died`（代理子进程崩溃——SSE 随后关闭）和
`client_evicted`（您的队列溢出——SSE 随后关闭）。

### 5. 发送提示（返回到原始终端）

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"src/main.ts 是做什么的?"}]}'
# → {"stopReason":"end_turn"}
```

步骤 4 中的 `curl -N` 将会在帧到达时打印它们。

## 认证

对于非回环地址的任何情况，您**必须**传递 bearer 令牌：

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → 启动时会拒绝，除非设置了 QWEN_SERVER_TOKEN
```

然后客户端在每个请求上发送 `Authorization: Bearer $QWEN_SERVER_TOKEN`。`/health` **仅在回环绑定上**被豁免，以便 Pod 内的 k8s/Compose 存活探针（守护进程在 `127.0.0.1` 上监听）无需凭据。在非回环绑定（`--hostname 0.0.0.0` 等）上，`/health` 像所有其他路由一样需要令牌——否则攻击者可以探测任意地址来确认守护进程的存在。使用 `/capabilities` 端到端验证您的令牌是否正确（它始终需要认证）：

> **强化回环地址（`--require-auth`）。** 默认的回环无令牌行为对于单用户笔记本电脑是可以的，但在共享开发主机、CI 运行器或多租户工作站上不安全，因为任何本地用户都可以 `curl 127.0.0.1:4170`。传递 `--require-auth` 可以使 bearer 令牌在所有路由上强制要求——包括 `/health` 和 `/capabilities`——即使绑定到 `127.0.0.1`。没有令牌则启动失败。启用该标志后，**未认证**的客户端无法读取 `/capabilities` 来发现需要认证；发现表面就是 401 响应体本身。一旦认证成功，`caps.features.require_auth` 标签是部署已加固的事后确认（适用于审计/合规 UI）：
>
> ```bash
> qwen serve --require-auth --token "$(openssl rand -hex 32)"
> # → /health, /capabilities, /session, … 都需要 Authorization: Bearer …
> curl http://127.0.0.1:4170/health
> # → 401
> curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
> # → 13   (或其他索引——认证后非空表示标签存在)
> ```

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# 错误的令牌 → 401
```

令牌比较是恒定时间的（SHA-256 + `crypto.timingSafeEqual`）；401 响应在“缺少头部”、“错误方案”和“错误令牌”之间是一致的，因此侧信道无法区分。

## CLI 标志

| 标志                                | 默认值         | 用途                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                       | `4170`          | TCP 端口。`0` = 操作系统分配的临时端口。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--hostname <addr>`                | `127.0.0.1`     | 绑定接口。非回环地址需要令牌。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--token <str>`                    | —               | Bearer 令牌。回退到 `QWEN_SERVER_TOKEN` 环境变量（会去除首尾空格——便于 `$(cat token.txt)` 使用）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--require-auth`                   | `false`         | 拒绝在没有 bearer 令牌的情况下启动，即使在回环地址上。强化 `127.0.0.1` 开发者默认设置，适用于共享开发主机 / CI 运行器 / 多租户工作站，其中任何本地用户都可以访问监听器。仅在设置了 `--token` 或 `QWEN_SERVER_TOKEN` 时启动；也将 `/health` 置于 bearer 保护之后。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--max-sessions <n>`               | `20`            | 并发活动会话的上限。新的 `POST /session` 请求如果会生成新的子进程，在达到上限时返回 `503`（带有 `Retry-After: 5`）；连接到现有会话不计数。设置为 `0` 以禁用。适用于单用户/小团队使用；如果您的部署有足够的 RAM/FD 余量（每个会话约 30–50 MB），可以调高。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--max-pending-prompts-per-session <n>` | `5`             | 每个会话中由 `POST /session/:id/prompt` 接受但尚未完成的提示上限，包括排队中的提示和活动提示。桥接器在返回 `promptId` 之前同步拒绝溢出，状态码为 `503`、`Retry-After: 5` 和 `code: "prompt_queue_full"`。设置为 `0` 以禁用。`branchSession` 在同一 FIFO 上序列化，但不计入此提示上限。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--workspace <path>`               | `process.cwd()` | 此守护进程绑定的绝对工作区路径（根据 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 — 1 个守护进程 = 1 个工作区）。`POST /session` 请求如果 `cwd` 不匹配则返回 `400 workspace_mismatch`。对于多工作区部署，每个工作区在单独的端口上运行一个 `qwen serve`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--max-connections <n>`            | `256`           | 监听器级别的 TCP 连接上限（`server.maxConnections`）。限制原始套接字数量，与会话计数无关——一旦达到上限，慢速/幽灵 SSE 客户端在接收时就会被拒绝。如果您的部署期望每个会话有很多 SSE 订阅者，请与 `--max-sessions` 一起调高。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--event-ring-size <n>`            | `8000`          | 每个会话的 SSE 重放环形深度（#3803 §02 目标）。设置 `GET /session/:id/events` 配合 `Last-Event-ID: N` 可用的积压数量。更大的值 = 更大的重连余量，但每个会话会多占用几百 KB RAM。SDK 客户端还可以通过 `?maxQueued=N` 请求特定订阅的更大每订阅者积压上限（范围 `[16, 2048]`，默认 256）。守护进程还会在队列填充 75% 时发出非终止的 `slow_client_warning` SSE 帧，以便客户端在被驱逐之前清除/重连。可通过 `caps.features.slow_client_warning` 预检查。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-client-budget <n>`          | —               | 每个 **ACP 会话** 的实时 MCP 客户端正整型上限（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14 v1；PR 23 通过共享 MCP 池将其升级为每个工作区）。与 `--mcp-budget-mode` 结合使用。未设置时，不进行基于账户的强制实施（但 `GET /workspace/mcp` 仍然报告 `clientCount`）。与 claude-code 的 `MCP_SERVER_CONNECTION_BATCH_SIZE` 不同，后者限制的是启动并发性，而非客户端总数。可通过 `caps.features.mcp_guardrails` 预检查。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-budget-mode <m>`            | `warn` / `off`  | `--mcp-client-budget` 的强制实施方式。`warn`（设置预算时的默认值）：不拒绝，快照的 `budgets[0].status` 在预算使用 ≥75% 时切换为 `warning`。`enforce`：超过上限的连接被拒绝，每个服务器单元格显示 `disabledReason: 'budget'`，按 `mcpServers` 声明顺序确定。`off`（未设置预算时的默认值）：纯可观测性。启动时如果设置 `enforce` 但没有预算则拒绝。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--http-bridge`                    | `true`          | 第一阶段模式：每个守护进程一个 `qwen --acp` 子进程（启动时绑定到一个工作区，根据 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02）；N 个会话通过 ACP `newSession()` 复用该子进程。第二阶段的原生进程内模式将在后续提供。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--allow-origin <pat>`             | —               | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。浏览器 WebUI 客户端的跨源允许列表。可重复。每个值是 `*`（任何来源——启动时如果没有配置 bearer 令牌则拒绝；建议在回环地址上使用 `--require-auth`，以便 `/health` 和 `/demo` 也受 bearer 保护，因为默认情况下两者在回环地址上都是预认证的）或规范 URL 来源（`<scheme>://<host>[:<port>]`，无尾部斜杠/路径/用户信息/查询）。**子域名通配符（`https://*.example.com`）明确不支持**——请显式列出每个子域名，或使用 `*` 配合已配置的令牌（以及用于完全加固的 `--require-auth`）。匹配的来源会收到 CORS 响应头（`Access-Control-Allow-Origin`、`Vary: Origin`、方法、头、max-age 和暴露的 `Retry-After`）；不匹配的来源仍会收到 403，与当前隔离墙相同的信封。`Origin: null`（沙箱化的 iframe、file:// 文档）始终被拒绝，即使在 `*` 下也是如此。可通过 `caps.features.allow_origin` 预检查。回环自来源命中不受影响。 |
| `--web` / `--no-web`              | `true`          | 在守护进程根路径（`GET /`、`/assets/*` 和 SPA 深层链接回退）提供内置的 Web Shell SPA。静态 shell 在 bearer 认证门控之前注册——浏览器无法将令牌附加到 `<script>` 子资源或地址栏导航，shell 不携带任何密钥，所有 API 路由无论是否启用 web 都受令牌门控。在非回环绑定上，会有一条单行的 stderr 警告，指出 UI 无需认证即可访问。使用 `--no-web` 运行仅 API 的守护进程。如果构建省略了 Web Shell 资产，则该标志无效（守护进程会记录一条面包屑并作为仅 API 运行）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--open`                           | `false`         | 监听器启动后，在默认浏览器中打开守护进程 URL 的 Web Shell（如果配置了令牌，会附加 `#token=` 作为 URL 片段——片段从不发送到服务器，从而确保令牌不会出现在访问日志和 Referer 头中）。如果使用 `--no-web`，或在无头/CI/SSH 环境中没有可用浏览器，则该标志无效。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
> **负载旋钮的调优。** `--max-sessions` 是新生成的子进程上限。
> 还有其他三层也限制负载 —— 为高并发部署调整大小时，应一起调整它们：
>
> - **listener 层**：`--max-connections` / `server.maxConnections=256`
>   限制原始 TCP 连接数（慢客户端反压）。
> - **每会话订阅者**：EventBus 默认将 SSE 订阅者上限设为每会话 64 个；第 65 个客户端会收到一个终态
>   `stream_error` 并被关闭。
> - **每会话提示请求准入**：
>   `--max-pending-prompts-per-session=5` 限制一个会话中排队 + 活跃的提示请求数。超出返回 `503`
>   并附带 `Retry-After: 5`。
> - **每订阅者积压**：每个 SSE 客户端有一个 256 帧的队列；超出容量的客户端会收到一个终态 `client_evicted` 帧
>   并被关闭（一个慢消费者无法卡住守护进程）。
>
> 这些上限相互作用：`--max-sessions × 64 subscribers × 256 frames`
> 是 EventBus 层最坏情况下的内存占用，而
> `--max-sessions × --max-pending-prompts-per-session` 限制了准入层接受的提示工作。
> 默认大小针对单用户 / 小团队负载；对于多租户部署，逐步提高（并观察 RSS）。

> **MCP 客户端护栏（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** 如果一个工作区在 `mcpServers` 中声明了 30 个 MCP 服务器，不设置上游上限的话将启动 30 个客户端。`--mcp-client-budget=N` 限制活跃 MCP 客户端数量；`--mcp-budget-mode={enforce,warn,off}` 选择行为。当设置了预算时默认值为 `warn`（快照会显示警告，但不会拒绝任何客户端——这对于在实际强制执行之前测量真实扇出很有用）。在 `enforce` 模式下被拒绝的服务器会在其服务器单元格上显示 `disabledReason: 'budget'`，并且 `budgets[0]` 单元格显示 `status: 'error'` + `errorKind: 'budget_exhausted'`。槽位按服务器名保留，并且在重连 / 发现超时时仍然有效——被拒绝的服务器无法从健康服务器那里抢占槽位。
>
> ⚠️ **v1 范围：每会话，而非每工作区。** 守护进程内的每个 ACP 会话都有自己的 `Config`/`McpClientManager`（通过 `newSessionConfig` 为每个会话创建）。预算限制的是**每会话**的活跃 MCP 客户端，而不是跨工作区所有会话的聚合。`GET /workspace/mcp` 处的快照反映的是引导会话的视图（单元格带有 `scope: 'session'` 以示诚实）。如果你运行 5 个并发 ACP 会话，且 `--mcp-client-budget=10`，那么整个守护进程中可能有多达 50 个活跃 MCP 客户端——上限是按会话生效的。**Wave 5 PR 23（共享 MCP 池）** 引入了工作区范围的管理器，并将其升级为真正的每工作区强制执行。
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # 稍后，根据遥测数据显示你的实际分布后：
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> 这与 claude-code 的 `MCP_SERVER_CONNECTION_BATCH_SIZE`（它控制启动并发性）不同；它们是正交的。PR 23 将添加一个真正的共享 MCP 池（`budgets[]` 中带 `scope: 'workspace'` 的单元格，与每个会话的单元格并列）；PR 14 v1 是现有每会话管理器上的进程内计数器 + 软强制执行。
>
> **推送事件（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）。** 订阅了 `GET /session/:id/events` 的 SDK 客户端在预算阈值被跨越时会收到类型化帧——`mcp_budget_warning`（合成事件，每次向上跨越 75% 时触发一次，带迟滞重置为 37.5%，通过 `mcp_guardrail_events` 通告）和 `mcp_child_refused_batch`（在 `enforce` 模式下每次发现传递时合并；从 `readResource` 惰性生成拒绝时长度为 1）。`GET /workspace/mcp` 处的快照仍然是重连后状态的真实来源；事件是变更边缘。在需要实时仪表化而无需轮询时非常有用。

## 默认部署威胁模型

- **仅 127.0.0.1**——回环绑定，无需认证。
- **`--hostname 0.0.0.0` 需要一个 token**——启动时没有 token 会拒绝。
- **`LOOPBACK_BINDS` 包含 IPv6**——`::1` 和 `[::1]` 也被视为回环地址，适用于无 token 规则。
- **Host 头部允许列表**——在**回环**绑定时，守护进程检查 `Host:` 是否匹配 `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port`（根据 RFC 7230 §5.4 不区分大小写），以防御 DNS 重绑定。**非回环绑定（`--hostname 0.0.0.0`）有意绕过 Host 允许列表**——操作者已选择了暴露面，因此 bearer-token 门是唯一的认证层；反向代理 / SNI / 客户端证书锁定是操作者的责任，而非守护进程的。如果你需要在非回环绑定上基于 Host 进行隔离，请在边界代理处终止 TLS 并检查 Host。
- **CORS 默认拒绝任何浏览器 Origin**——返回 `403` JSON。通过 **`--allow-origin <pattern>`**（可重复，T2.4 #4514）选择性地允许特定浏览器 origin 通过。每个值要么是字面 `*`（任意 origin——如果没有配置 bearer token，启动会拒绝；建议在回环绑定上使用 `--require-auth` 以完全加固，因为 `/health` 和 `/demo` 默认在回环上保持预认证状态），要么是一个规范的 URL origin（`<scheme>://<host>[:<port>]`，无尾部斜杠 / 路径 / userinfo）。匹配的 origin 会收到正确的 CORS 响应头（`Access-Control-Allow-Origin: <回显的>`, `Vary: Origin`，加上标准方法 / 头部 / max-age 和暴露的 `Retry-After`）；未匹配的 origin 仍然会得到与默认墙相同的 403 响应。`caps.features.allow_origin` 会条件性通告，以便 SDK / webui 客户端在发出跨域请求之前检查守护进程是否支持。示例：`qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`。回环自 origin 的请求（例如 `/demo` 页面）不受影响——一个单独的 Origin 剥离 shim 会处理它们，无论是否设置了 `--allow-origin`。**未配置 `--allow-origin` 的浏览器 webui** 仍然回退到与之前相同的 Stage 1 选项：打包为原生 shell（Electron/Tauri）以不发送 `Origin` 头部，或者在守护进程前放置一个同源反向代理。
- **衍生出的 `qwen --acp` 子进程继承守护进程的环境**，但会显式清理一个变量：在子进程启动前移除 `QWEN_SERVER_TOKEN`（守护进程自己的 bearer；agent 不需要它）。其他所有变量——`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `QWEN_*` / `DASHSCOPE_API_KEY` / 你的自定义 `modelProviders[].envKey` 等等——都会传递过去，因为 agent 确实需要它们来向 LLM 认证。**这是有意为之，并非沙箱。** agent 以相同 UID 运行，并拥有 shell 工具访问权限，因此 `~/.bashrc` / `~/.aws/credentials` / `~/.npmrc` 中的任何内容都可以通过提示注入被访问。环境变量传递不是安全边界；用户作为信任根才是。不要在一个具有你不会信任 agent 的环境常驻凭据的身份下运行 `qwen serve`。
- **每订阅者有限 SSE 队列**——溢出队列的慢客户端会收到一个终态 `client_evicted` 帧并被关闭；一个卡住的消费者无法卡住守护进程。
- **每会话提示请求准入上限**——默认每个会话最多接受 5 个已接受但未结算的提示请求。有缺陷的客户端无法为一个会话排队无限制的提示承诺或临时 SSE 等待。
- **优雅关闭**——SIGINT/SIGTERM 会在关闭监听器之前排空 agent 子进程（每个子进程 10 秒超时）。

> ⚠️ **Stage 1 已知差距——权限是守护进程全局的，而非每会话（BUy4H）。** `pendingPermissions` 存在于守护进程作用域；任何持有 bearer token 的客户端都可以对它能看到的任何会话的任何 `requestId` 进行投票（并且 SSE `permission_request` 事件在其有效载荷中携带 requestId）。这在单用户/小团队信任模型下是可接受的，其中每个经过认证的客户端都是同一个人类或他们信任的协作者。Stage 1.5 将迁移到 `POST /session/:id/permission/:requestId` + 会话作用域的待处理映射 + 每客户端身份（下游审查中的必须项 #3）；在此之前，不要在共享给不受信任方的 bearer 后面运行 `qwen serve`。
>
> ⚠️ **Stage 1 已知差距——`POST /session/:id/prompt` 请求体上限为 10 MB（BUy4L）。** 包含图像 / PDF / 音频且超过 10 MB 的多模态提示请求会在路由逻辑运行之前的请求体解析阶段失败（无流式、无中途上传中止）。解决方法：在客户端缩小内容，或者传递路径引用让 agent 通过 `readTextFile` 读取文件。Stage 1.5 将接受 `/prompt` 上的 `multipart/form-data` 或分块编码，这样大提示请求就不会撞上限。
>
> ⚠️ **Stage 1 已知差距——NAT 背后的幽灵 SSE 连接。** 守护进程通过心跳（15 秒间隔）上的 TCP 反压检测死客户端。一个在没有 TCP RST 的情况下消失的客户端（例如，NAT 盒子静默丢弃空闲流）会保持内核级套接字“存活”，直到 Node 的 keepalive 探测超时——在 Linux 默认设置下通常约 2 小时。在 `--hostname 0.0.0.0` 部署中，如果位于此类 NAT 后面，幽灵 SSE 连接会累积并最终达到 256 `server.maxConnections` 上限。
>
> 设置 [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout)
> （issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9）
> 通过显式的应用层空闲超时来弥补这个差距：
> 当在 `n` 毫秒内没有成功刷新写入时，守护进程会发送一个终态 `client_evicted` 帧，并附带
> `reason: 'writer_idle_timeout'` 并关闭流。该标志默认关闭以保留遗留契约——在丢弃 RST 的网络上的操作者应选择一个远大于 15 秒心跳间隔的值（例如 `60000`–`300000`），这样合法的空闲连接不会被驱逐，而真正卡住的写入者会迅速被清理。在 SDK 中通过 `caps.features.includes('writer_idle_timeout')` 预检以确认守护进程支持该功能。

### Deadlines 和写入器空闲超时

Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 提供了两个 opt-in 标志，以弥补 15 秒心跳 + AbortSignal 无法覆盖的长时间运行 / 远程部署差距。两者默认关闭——单用户回环工作流保持完全不变。

| 标志                             | 环境变量                             | 默认值 | 作用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ----------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | 未设置   | 单个 `POST /session/:id/prompt` 的服务器端挂钟超时。到期时守护进程会中止该提示的 AbortController 并返回 HTTP `504`，附带 `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`。每个提示请求的请求体字段 `deadlineMs` 可以缩短有效截止时间至低于标志值，但绝不能延长。能力标签（条件性）：`prompt_absolute_deadline`。                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | 未设置   | 每个 SSE 连接的闲置超时。当在 `n` 毫秒内没有写入被**成功**刷新——既没有真实事件也没有 15 秒心跳——守护进程会发送一个终态 `client_evicted` 帧，附带 `data.reason = 'writer_idle_timeout'`（也反映在 `data.errorKind` 中）并关闭流。**选择一个远高于 15 秒心跳的值**（例如 `30000`–`300000`），这样合法的空闲流就不会被驱逐；小于 `15000` 的值**会**在第一次心跳触发之前驱逐原本健康的空闲连接（仅用于测试 / 短生命周期的开发会话是有意为之）。能力标签（条件性）：`writer_idle_timeout`。 |

两个标志都接受正整数的毫秒值；`0`、`NaN`、非整数或负值会在启动时被拒绝，并附带清晰的错误消息。CLI 标志优先于环境变量；显式的 `ServeOptions` 字段（嵌入式调用者）优先于环境变量。SDK 消费者在依赖其中任一行为之前，应预检匹配的能力标签——早于该 PR 的守护进程会省略这两个标签，并且请求的 `deadlineMs` 字段会被静默忽略。

## 多会话 & 多工作区部署

根据 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02，每个 `qwen serve` 进程在启动时绑定到**一个工作区**。在该工作区内，它将 N 个会话多路复用到一个 `qwen --acp` 子进程上，使用 agent 的原生会话映射——会话共享子进程的进程 / OAuth 状态 / 文件读取缓存 / 层级内存解析。

要托管**多个工作区**（一个用户，多个仓库；或同一主机上的多个用户），运行**多个守护进程**——每个工作区一个进程，每个进程使用自己的端口，由 systemd / docker-compose / k8s / `qwen-coordinator` 参考编排器管理。这种权衡是有意的：每个子进程对应一个工作区意味着 `loadSettings(cwd)` / OAuth / MCP 服务器作用域与绑定的目录保持一致，并且在请求之间不会漂移。

> **在 attach 时先订阅再发布 `modelServiceId`。** 当客户端 `POST /session` 并附带 `modelServiceId`，而工作区已经有一个运行不同模型的会话时，守护进程会发出一条内部 `setSessionModel` 调用——失败不会作为 HTTP 错误传播（会话会继续在当前模型上运行）。可见的失败信号是会话 SSE 流上的 `model_switch_failed` 事件。如果你先调用 `POST /session`，然后才打开 `GET /session/:id/events`，你会错过失败事件，并默默地继续与错误的模型通信。请先打开 SSE 流，或者在订阅时传递 `Last-Event-ID: 0` 以重放环中最旧的可用事件。

要处理多个**用户**（每个用户有自己的配额、审计日志、沙箱）或扩展到单个进程无法覆盖的范围（冷启动预算、文件描述符数量、RSS），为每个用户的每个工作区启动一个守护进程，置于外部编排器之后。该编排器（多租户 / OIDC / 配额 / 审计 / k8s）**不属于** qwen-code 项目的范围——请参阅 issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) 的“外部参考架构”以获取设计指导。

## 加载和恢复持久的会话

守护进程通过 HTTP 暴露 ACP 的 `session/load` 和恢复流程，使用两个路由：

| 路由                         | 使用场景                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`   | 客户端**没有**渲染过的历史（冷重连、选择器然后打开）。守护进程通过 SSE 重放每一个持久的轮次，以便订阅者看到完整的对话记录。能力标签：`session_load`。                                                                                        |
| `POST /session/:id/resume` | 客户端已经拥有屏幕上的轮次，只需要守护进程端的句柄。在 agent 端恢复模型上下文，无需 UI 重放——SSE 流保持干净。能力标签：`session_resume`（`unstable_session_resume` 仍然作为旧客户端的弃用别名存在）。 |

TypeScript SDK 将两者作为 `DaemonSessionClient` 的静态工厂方法暴露：

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// 冷重连——守护进程将通过 SSE 重放历史记录。
const session = await DaemonSessionClient.load(client, 'persisted-id');

// 或者，如果你的 UI 已经有历史记录，跳过重放：
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // 先是重放的 `session_update` 帧（仅 load 时），
  // 然后是实时事件。
}
```

在调用之前预检 `caps.features.session_load` / `caps.features.session_resume`——较旧的守护进程会返回 `404`。`unstable_session_resume` 仍被通告为弃用的兼容性别名。对相同 id 的并发相同操作请求会合并；交叉操作竞争（`load` 与 `resume` 竞争）会得到 `409 restore_in_progress` 并附带 `Retry-After: 5`。完整的错误信封请参阅[协议参考](../developers/qwen-serve-protocol.md)。

注意：历史回放受 SSE 环限制（默认 8000 帧）。包含大量轮次的长历史记录可能会超出该限制——最早的帧会被静默丢弃。对于非常长的会话，建议使用 `resume` 并依赖客户端的本地持久化 UI。

## 持久性模型

**在 Stage 1 中，会话在守护进程重启后仍然是临时的**，但磁盘上持久化的会话可以重新加载：

- 子进程崩溃会发布 `session_died` 并从守护进程的映射中移除实时会话。如果能够生成一个新的 agent 子进程，则可通过 `POST /session/:id/load` **重新加载**磁盘上持久化的会话。
- 守护进程重启会丢失所有正在进行的实时会话。持久化的会话保留在磁盘上，可以针对新的守护进程进程加载，但需遵循相同的工作区绑定规则。
- 长时间客户端断开（聊天轮次超过 5 分钟）可能会超出 SSE 重放环（默认 8000 帧）——`Last-Event-ID` 重连会成功，但状态可能不一致。对于移动 / 网络不稳定的客户端，建议在长时间断开后重新打开 SSE，或调用 `POST /session/:id/load` 从磁盘重放。
- 文件操作（`writeTextFile`）在崩溃时是原子性的（先写后重命名）；在守护进程重启意义上它们不是原子性的，无法重放——文件写入要么成功要么没发生。

如果你的集成需要比 `session/load` 提供的更强的跨重启持久性（例如，服务端管理的重试队列），你仍然需要应用层的状态恢复。不要在守护进程的会话中持有长时间运行、对重启敏感的状态。

## Stage 1.5+ 运行时保证

Stage 1 的合约针对原型设计。根据 [#3889 chiga0 下游消费者审查](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644)，以下**不**在 Stage 1 中——生产级集成需要 Stage 1.5+ 才能依赖它们：
**下游严肃使用的阻碍项：**

1. **`loadSession` / `unstable_resumeSession` over HTTP** — 没有这个功能，任何集成都无法在子进程崩溃或守护进程重启后存活，并且任何协调守护进程的编排器也无法恢复状态。
2. **持久的客户端身份（配对令牌 + 基于客户端撤销）** — 阶段1使用一个共享的bearer令牌；令牌泄露会撤销所有用户，并且 `originatorClientId` 是客户端自行声明的，而不是由守护进程从经过身份验证的身份中标记的。

**可靠性基线：**

3. ~~**客户端发起的心跳路径**~~ — 通过 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 9 发布。`POST /session/:id/heartbeat` 在守护进程上记录最近一次看到的时间戳（能力标签 `client_heartbeat`）；SDK 辅助函数为 `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`。
4. **`permission_already_resolved` 事件** — 当投票输掉首个响应者竞争时；目前 UI 必须从 `404` 推断状态。
5. ~~**更大的重放环**~~ — 增加到 8000。**可逐会话配置的环** 仍然开放 — 移动端 / 频繁交互的工作负载可能需要逐会话覆盖。
6. **`slow_client_warning` 事件 before `client_evicted`** — 软背压，使得表现良好的慢速客户端可以在被终止前自我节流（修剪渲染深度，丢弃数据块）。

**集成工效学：**

7. **用于 IM 风格上下文的 `POST /session/:id/_meta`** — 附加到后续提示的每个会话键值对（聊天 ID、发送者、线程 ID）取代了每个频道的临时方案。
8. **`/capabilities` 实际特性协商** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }` 使客户端能够检测漂移，而不是回退到“未知帧，忽略”。
9. **一流的持久化文档**（本节）— 已在上文发布。

完整的融合路线图在 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) 中跟踪。

## 阶段1范围边界——我们在阶段1.5中不会修复什么

两个结构性选择是阶段 1 / 1.5 / 2 主线路线图的明确非目标。如果你的用例依赖其中之一，请自行规划，而不是等待我们。

### 会话状态仅限于本地更新（根据 [LaZzyMan review #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721)）

阶段 1.5 计划将 TUI 描述为进程内 EventBus 订阅者。实际上**TUI UI 严格大于 wire 协议**：

- **仅本地 UI** — 大约 15 个 Ink 对话框组件（`ModelDialog`、`MemoryDialog`、`PermissionsDialog`、`SessionPicker`、`WelcomeBackDialog`、`FolderTrustDialog`…）和 `local-jsx` 斜杠命令（`/ide`、`/auth`、`/init`、`/resume`、`/rename`、`/delete`、`/language`、`/arena`…）渲染终端专用的 Ink JSX。远程客户端通过 HTTP/SSE 无法等效地渲染 Ink，并且这些流程不会发出 wire 事件。
- **没有 wire 事件的会话状态更新** — `/approval-mode`、`/memory add`、`/mcp add-server`、`/agents`、`/tools enable/disable`、`/auth`、`/init`（写入 `CLAUDE.md`）都会改变代理行为，但只有 `/model` 目前发布了事件（`model_switched`）。

**阶段1的选择——审查中的选项（A）**：不要将这些更新升级为 wire 事件。两种部署模式有不同的后果。

#### 模式1 — 无头 `qwen serve`（本 PR）

守护进程内没有运行 TUI shell。上面列出的斜杠命令**在此模式下不存在**——没有终端 UI 来发出它们。因此会话状态是：

- **启动时冻结** 对于 `approval-mode` / `memory` / `agents` / `tools` 允许列表 / `auth` — 所有这些都是在守护进程的 `qwen --acp` 子进程启动时从设置和磁盘加载；在会话生命周期内不可变。设置定义的 MCP 服务器同样在启动时冻结，但**运行时添加的服务器**（通过 `POST /workspace/mcp/servers`）可以在不重启的情况下添加或删除。
- **通过 HTTP 可变** 通过 `POST /session/:id/model`（发布 `model_switched`）、`POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name`（发布 `mcp_server_added` / `mcp_server_removed`）以及权限投票（`POST /permission/:requestId`）。

**后果：** 无头模式下的远程客户端看到**完整的会话状态**。没有 TUI 隐藏额外状态；不可能出现漂移。如果你想更改 `approval-mode`，请使用新设置重启守护进程。MCP 服务器现在可以通过变体路由（`POST /workspace/mcp/servers`、`DELETE /workspace/mcp/servers/:name`）在运行时添加/删除——请参阅[运行时 MCP 服务器管理](#runtime-mcp-server-management-issue-4514)。

#### 模式2 — 阶段1.5 `qwen --serve` 共存的 TUI（不在此 PR 中）

当阶段 1.5 推出 `qwen --serve`（TUI 进程与同一 HTTP 服务器共存）时，TUI **确实**与远程客户端共存。本地操作员输入 `/approval-mode yolo` 或 `/mcp add-server` 会更新会话状态，而 HTTP 上的远程客户端没有事件观察到该更改。

在这种模式下，TUI 是一个“超级客户端”——它观察与其他远程客户端相同的代理对话，并且可以更新远程客户端无法更新的会话状态。不对称性在于：

- ✅ TUI 和远程客户端都看到相同的代理消息、工具调用、文件差异、权限提示。
- ❌ 只有 TUI 看到/更新 approval-mode / memory / MCP 服务器列表 / agents / tools 允许列表 / auth 状态。

**模式2的后果：** 如果远程客户端 UI 试图镜像会话设置，那么在任何 TUI 斜杠命令之后都可能出现漂移。远程客户端应在**附加/重新连接时重新获取状态**（使用 `Last-Event-ID: 0` 来重放环中最旧的事件，例如 `model_switched`）；它们不应依赖增量事件来获取 TUI 端的更新。

#### 为什么选择（A）而不是（B）（将更新升级为 `session_state_changed` 事件系列）

（B）是更雄心勃勃的答案，但将阶段 1.5 锁定在一个更大的 wire 表面，而且该表面还必须干净地通过计划的进程内重构。我们宁愿诚实地走较小的范围。会话状态事件分类工作——枚举哪些 TUI 流程是设计上仅本地的，与哪些在未来的可选（B）风格扩展下有可能升级为 wire 事件——移至 [#3803](https://github.com/QwenLM/qwen-code/issues/3803)，而不是阶段 1.5 代码。

### N个并行会话共享一个 `qwen --acp` 子进程

同一工作空间上的多个会话**共享一个 `qwen --acp` 子进程**，通过代理的原生多会话支持（`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`）。桥接器为每个会话调用 `connection.newSession({cwd, mcpServers})`——代理将它们存储在其会话映射中，并根据调用时的 sessionId 进行多路分解。

在同一工作空间上 N=5 个会话的具体成本：

| 资源                             | 每个会话 | N=5 时                     |
| -------------------------------- | -------- | -------------------------- |
| 守护进程 Node 进程               | 一个      | **30–50 MB**（一个守护进程）|
| `qwen --acp` 子进程              | 共享      | **60–100 MB**（一个子进程）|
| MCP 服务器子进程                 | 每个会话  | 如果配置不同则为 3×N       |
| `FileReadCache`（子进程堆中）     | 共享      | 解析一次                   |
| `CLAUDE.md` / 层级内存解析       | 共享      | 解析一次                   |
| OAuth 刷新令牌状态               | 共享      | **一个刷新路径**            |
| 自动内存学习事实                 | 共享      | 每个子进程一个知识库       |
| 冷启动                           | 仅首次    | 首个会话后 <200 ms          |

桥接器为每个守护进程保持**一个通道**（每个工作空间一个守护进程，参见 §02）。只要至少有一个会话存活，通道就保持活跃；最后一个 `killSession`（或通道级崩溃）会杀死子进程。

**MCP 服务器子进程**今天仍然是每个会话的——每个会话的配置可以指定不同的服务器，因此它们是独立启动的。阶段 1.5 后续：按 `(workspace, config-hash)` 对 MCP 服务器子进程进行引用计数，以便相同配置的共享。不在本 PR 范围内。

**同类代理（Cursor / Continue / Claude Code / OpenCode / Gemini CLI）都采用单进程多会话。** qwen-code 在代理层与它们保持一致；本 PR 中的阶段 1 桥接器通过 HTTP 使相同的架构可见。

## 登录远程守护进程（issue #4175 PR 21）

当守护进程在远程 Pod 上运行时（与你没有共享显示），客户端可以
通过 HTTP 触发 OAuth 设备流程。守护进程自行轮询 IdP；你的任务
只是在有浏览器的设备上打开一个 URL。

> [!note]
>
> Qwen OAuth 免费套餐已于 2026-04-15 停止。下面的 `qwen-oauth`
> 示例记录了设备流程协议形状和遗留提供商标识符；
> 新设置应使用当前受支持的认证提供商。

```bash
# 1. 启动一个流程。守护进程联系 IdP，返回一个代码和 URL。
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

# 2. 在你的手机/笔记本电脑上访问该 URL，输入用户代码。
# 3. 轮询完成（或订阅 SSE 以获取 auth_device_flow_authorized 事件）：
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → 状态转换：pending → authorized
```

TypeScript SDK 将这两个步骤包装到一个辅助函数中：

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Open ${flow.verificationUri}\nCode: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**守护进程永远不会代表你打开浏览器。** 即使在本地运行，守护进程也保持被动——它返回 URL 并让 SDK/用户选择在哪里打开它。这是有意为之：在无头 Pod 上调用 `xdg-open` 的守护进程会静默失败，掩盖实际的认证表面。在你的客户端中镜像 `gh auth login` 的“按 Enter 打开浏览器”的 UX。

**`--require-auth` 和开发便利性。** 设备流程路由使用严格的更新门控（PR 15），这意味着没有令牌的环回默认返回 `401 token_required`。在本地，开发过程中绕过此问题的最简单方法是使用 `qwen serve --token=dev-token`；除非你要强化环回默认值，否则不需要 `--require-auth`。

**跨守护进程限制。** `oauth_creds.json` 是守护进程共享的（`~/.qwen/oauth_creds.json`），因此守护进程 A 的成功登录会自动被守护进程 B 的下一次令牌刷新捕获——但守护进程 B 的 SDK 客户端不会收到 `auth_device_flow_authorized` 事件（事件是按守护进程的）。

**跨客户端接管。** 同一守护进程上的两个 SDK 客户端都为同一个提供商 `POST /workspace/auth/device-flow`，会得到每个提供商的单例：第一个调用启动一个新的 IdP 请求并返回 `attached: false`；第二个调用返回现有正在进行的条目，并附带 `attached: true`。接管会记录在审计跟踪中（在第二个客户端的 `X-Qwen-Client-Id` 下），但不会发出单独的事件——一旦用户完成 IdP 页面，两个客户端最终都会观察到相同的 `auth_device_flow_authorized` 事件。如果你的 UI 区分“我启动的”和“别人加入的流程”，则根据 `start()` 返回的 `attached` 字段进行分支。

## 守护进程日志文件

`qwen serve` 为每个进程写入诊断日志到：

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log
```

同一目录中的 `latest` 符号链接始终指向当前进程的日志，因此 `tail -f ~/.qwen/debug/daemon/latest` 将跟踪运行中的守护进程。

日志捕获生命周期消息、路由错误（带有 `route=` 和 `sessionId=` 上下文）、ACP 子进程的 stderr，以及——当设置了 `QWEN_SERVE_DEBUG=1` 时——额外的桥接面包屑。今天输出到 stderr 的行仍然输出到 stderr；文件日志是**附加的**，而不是替代品。

### 禁用

设置 `QWEN_DAEMON_LOG_FILE=0`（或 `false`/`off`/`no`），完全跳过文件日志记录。stderr 输出不受影响。

### 与会话调试日志的关系

会话级调试日志（`~/.qwen/debug/<sessionId>.txt` 和 `~/.qwen/debug/latest` 符号链接）是独立的。守护进程日志位于兄弟目录 `daemon/` 中；每个会话的调试语义不受此功能影响。

### 无轮转

守护进程日志无限追加。如果文件变大，请手动轮转。未来的增强可能会添加自动轮转；通过 [#4548](https://github.com/QwenLM/qwen-code/issues/4548) 跟踪后续。

## 运行时 MCP 服务器管理（issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514)）

无需重启守护进程即可在运行时添加或删除 MCP 服务器。运行时条目位于一个临时的覆盖层中，该覆盖层**遮蔽**了同名的设置定义服务器；底层的 `settings.json` / `mcpServers` 配置永远不会被写入。

**预检：** 在调用任一路由之前，检查 `caps.features` 是否包含 `mcp_server_runtime_mutation`。没有此标签的较旧守护进程返回 `404`。

### `POST /workspace/mcp/servers` — 添加一个运行时 MCP 服务器

严格门控（需要 bearer 令牌）。通过实时的 `McpClientManager` 立即连接服务器并发现其工具。

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

`name` 必须为字母数字，加上 `_` 和 `-`（最多 256 个字符）。`config` 是在 `settings.json` 的 `mcpServers` 条目中使用的相同 MCP 服务器配置对象（传输相关字段：`command`/`args` 用于 stdio，`url` 用于 SSE/HTTP）。安全敏感字段（`trust`、`env`、`cwd`、`oauth`、`headers`、`authProviderType`、`includeTools`、`excludeTools`、`type`）会被守护进程剥离并忽略。

响应（200）— 成功：

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

- `replaced: true` — 已经存在同名的运行时条目，且配置指纹不同；旧连接被拆除，新连接建立。当指纹匹配时（幂等重新添加），`replaced` 为 `false`。
- `shadowedSettings: true` — 存在一个设置定义的同名服务器；运行时条目现在遮蔽了它。设置条目未被修改，如果稍后删除运行时条目，它会重新出现。
- `toolCount` — 在新连接的服务器上发现的工具数量。

响应（200）— 软拒绝（预算警告模式）：

```json
{
  "name": "my-server",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

当 `--mcp-budget-mode=warn` 且添加该服务器会超出配置的 `--mcp-client-budget` 时返回。服务器**未**连接。调用者应向上通报预算压力给用户。

错误：

| 状态   | 代码                      | 发生时机                                                                                   |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------ |
| `400`  | `invalid_server_name`     | 名称为空、超过 256 个字符或包含 `[A-Za-z0-9_-]` 之外的字符                               |
| `400`  | `missing_required_field`  | `config` 缺失或不是非空对象                                                                 |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id` 头存在但未在该工作空间注册                                               |
| `400`  | `invalid_config`          | 配置格式被 MCP 传输验证器拒绝                                                               |
| `401`  | `token_required`          | 没有配置 bearer 令牌（严格门控）                                                             |
| `409`  | `mcp_budget_would_exceed` | `--mcp-budget-mode=enforce` 且预算已满                                                      |
| `502`  | `mcp_server_spawn_failed` | 服务器进程退出或在连接期间超时；响应体中包含 `serverName`、`exitCode`、`stderr`               |
| `503`  | `acp_channel_unavailable` | 没有活动的 ACP 子进程（尚未创建任何会话）                                                   |

### `DELETE /workspace/mcp/servers/:name` — 删除一个运行时 MCP 服务器

严格门控。断开服务器连接并将其从运行时覆盖层中移除。幂等——删除一个从未添加过的名称会返回跳过响应（而不是错误）。

`:name` 路径参数是 URL 编码的服务器名称。

响应（200）— 成功：

```json
{
  "name": "my-server",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` — 被删除的运行时条目正在遮蔽一个设置定义的同名服务器。该设置条目现在被取消遮蔽，并将在下次发现/重启时使用。

响应（200）— 幂等跳过：

```json
{
  "name": "ghost",
  "skipped": true,
  "reason": "not_present"
}
```

当该名称不在运行时覆盖层中时返回（它可能仍然存在于设置中——设置条目不能通过此路由删除）。

错误：

| 状态   | 代码                      | 发生时机                                                                     |
| ------ | ------------------------- | ---------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | 名称为空、超过 256 个字符或包含 `[A-Za-z0-9_-]` 之外的字符                   |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id` 头存在但未在该工作空间注册                                 |
| `401`  | `token_required`          | 没有配置 bearer 令牌（严格门控）                                               |
| `503`  | `acp_channel_unavailable` | 没有活动的 ACP 子进程                                                         |

### 遮蔽语义

运行时条目形成一个临时的覆盖层，位于设置定义的 MCP 服务器之上：

- **添加**一个与设置条目同名的运行时服务器会**遮蔽**它——运行时配置优先。原始设置条目未被修改。
- **删除**一个正在遮蔽设置条目的运行时服务器会**取消遮蔽**它——设置定义的配置将在下次连接时再次生效。
- **守护进程重启**会丢失所有运行时条目。只有设置定义的服务器能在重启后幸存。运行时服务器的作用域是会话生命周期。
- **`GET /workspace/mcp`** 报告合并后的视图——设置定义和运行时服务器都出现在 `servers[]` 数组中。在当前的快照中，两者之间没有 wire 级别的区分。

### 事件

两条路由都会发出**工作空间范围**的 SSE 事件（所有活动的会话总线都会收到）：

| 事件                | 触发时机                 | 负载字段                                                                       |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `mcp_server_added`   | `POST` 成功（未跳过）     | `name`、`transport`、`replaced`、`shadowedSettings`、`toolCount`、`originatorClientId` |
| `mcp_server_removed` | `DELETE` 成功（未跳过）   | `name`、`wasShadowingSettings`、`originatorClientId`                               |
跳过的回应（`budget_warning_only`、`not_present`）不会触发事件。

来自现有 `mcp_guardrail_events` 接口的预算相关事件（`mcp_budget_warning`、`mcp_child_refused_batch`）也会在运行时添加内容超过预算阈值时触发。

## 下一步

- **想要设置长期运行的守护进程？** 请参阅 [本地启动模板（systemd / launchd / nohup / tmux）](./qwen-serve-deploy-local.md)，适用于 v0.16-alpha（仅限本地）。
- **想要构建客户端？** 请查看 [DaemonClient TypeScript 快速入门](../developers/examples/daemon-client-quickstart.md) 和 [HTTP 协议参考](../developers/qwen-serve-protocol.md)。
- **阅读源码？** Bridge 代码位于 `packages/cli/src/serve/`；SDK 客户端位于 `packages/sdk-typescript/src/daemon/`。
- **关注路线图？** Stage 1.5 / Stage 2 的进展追踪于问题 [#3803](https://github.com/QwenLM/qwen-code/issues/3803)。