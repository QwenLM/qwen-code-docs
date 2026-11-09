# 守护进程模式（`qwen serve`）

将 Qwen Code 作为 HTTP 守护进程运行，使多个客户端（IDE 插件、Web UI、CI 脚本、自定义 CLI）能够通过 HTTP + Server-Sent Events 共享 Agent 会话，而不是各自启动自己的子进程。

> **状态：** 实验性功能。该守护进程支持本地和远程 Web Shell/API 部署。在将其暴露于回环地址之外之前，请查阅[身份验证](#authentication)和[部署威胁模型](#default-deployment-threat-model)。

## 核心功能

- **内置 Web Shell UI** — `qwen serve` 开箱即在根路径（`http://127.0.0.1:4170/`）提供基于浏览器的 Web Shell；运行 `qwen serve --open` 可在浏览器中自动打开。它与 API 同源，无需额外端口或反向代理。传入 `--no-web` 可启动纯 API 守护进程。

  当侧边栏加载后没有会话时，会隐藏 **无工作区会话**，就像隐藏 **已固定** 一样。当该组被隐藏时，使用主界面的 **新建会话** 按钮并在编辑器中选择 **无工作区** 以开始对话。

- **最多一个主 ACP 子进程加上每个受信任次要工作区一个按需子进程，多客户端** — 生产模式会尝试预热主 bridge 并在失败后于首次使用时重试；受信任的次要运行时按需启动自己的子进程，而不受信任的次要运行时永远不会启动子进程。在默认的 `sessionScope: 'single'` 下， targeting 同一工作区的客户端共享同一个 ACP 会话，并在同一对话、同一文件 diff、同一权限提示上进行协作。
- **支持安全重连的流式传输** — 带有 `Last-Event-ID` 重连机制的 SSE 允许客户端断开后从断点处（在 ring 的重放窗口内）精确恢复。
- **分页持久化转录** — `GET /session/:id/transcript` 以重放页的形式返回完整的活跃磁盘转录，无需附加客户端或更改实时 SSE 重放窗口。
- **首个响应者权限机制** — 当 agent 请求运行工具的权限时，所有连接的客户端都会看到该请求；首个响应的客户端获得处理权。
- **一个守护进程，一个或多个工作区** — 重复 `--workspace` 可在一个监听器下注册隔离的工作区运行时。第一个工作区为主工作区，并在请求省略 `cwd` 时作为默认值。
- **实验性的守护进程托管频道** — 使用 `qwen serve --channel <name>` 启动，或先不带频道启动，之后使用 `qwen channel set` 选择。Worker 是由守护进程生命周期拥有的独立进程。其选择可以被查询、替换、重新加载和停止，而无需重启守护进程。
- **远程运行时控制** — 更改会话的审批模式（`POST /session/:id/approval-mode`），按工作区启用/禁用工具（`POST /workspace/tools/:name/enable`）或加载的 skill（`POST /workspace/skills/:name/enable`），生成空的 `QWEN.md`（`POST /workspace/init`，仅机械生成 — 不调用模型；若需 AI 填充，请接着调用 `POST /session/:id/prompt`），使用预算预检重启单个 MCP 服务器（`POST /workspace/mcp/:server/restart`），或在运行时添加/移除 MCP 服务器而无需重启守护进程（`POST /workspace/mcp/servers`，`DELETE /workspace/mcp/servers/:name`）。默认的无 token 环回监听器可以使用所有这些操作；严格的工作区变更在其他部署模式下还需要运维凭据。
- **会话回顾**（[#4175](https://github.com/QwenLM/qwen-code/issues/4175) 后续）— 获取活跃会话的单句"我上次进行到哪了"摘要（`POST /session/:id/recap`）。它将核心的 `generateSessionRecap` 封装为针对快速模型的 side-query；不会污染主聊天历史或 SSE 流。非严格门控（与 `/prompt` 策略相同）；SDK 辅助方法 `client.recapSession(sessionId)`。
  - **已知限制 — token 成本放大**：该路由是纯成本端点（每次调用都是一次 LLM side-query，无状态收益），且守护进程在 v1 中没有单路由速率限制。在默认的无 token 环回配置下，有缺陷或恶意的本地客户端可能会通过大量请求消耗 token。在共享开发主机上暴露守护进程前，请配置 `--token`（以及可选的 `--require-auth`）。
  - **并发回顾安全性**：对同一会话同时发起的两个 `/recap` 调用会运行两个独立的 side-query。`generateSessionRecap` 通过 `GeminiClient.getChat().getHistory()` 读取聊天历史的快照，并将其提供给单独的 `BaseLlmClient.generateText` 调用（通过 `runSideQuery`）；它永远不会追加或修改会话的 `GeminiChat`。可安全地从多个客户端并发调用，无需协调。

## 部署与安全说明 [#deployment-and-security-notes]

- **默认信任回环地址** — `127.0.0.1:4170` 启动时无需 Bearer 身份验证，任何能够访问它的本地进程都会获得完整的 API 权限，包括以守护进程用户身份执行代码。在共享或不受信任的主机上，请使用稳定的 `QWEN_SERVER_TOKEN` 配合 `--require-auth`。
- **非回环监听器始终携带 Bearer 令牌** — 提供您自己的令牌或使用启动时打印的临时令牌。生成的令牌会在重启时轮换，因此可复用的客户端需要稳定的令牌。HTTP 是未加密的；在跨越不受信任的网络之前请配置 TLS。
- **后台启动有两条路径** — 使用 `qwen daemon start` 进行内置的本地生命周期管理，或者在需要服务管理器监管或重启后启动时使用 [systemd / launchd / tmux / nohup 模板](./qwen-serve-deploy-local.md)。
- **令牌持久化是可选的** — `qwen daemon start --save-token` 将显式提供的 Bearer 令牌存储在仅限所有者访问的辅助文件中，供 `qwen daemon token` 使用；普通的 `qwen serve` 和生成的令牌不使用该辅助文件。请参阅[检查和控制本地守护进程](#inspect-and-control-a-local-daemon)。
- **多工作区为单操作员模式** — 注册的工作区共享守护进程的 Bearer 令牌、监听器、配额和进程故障边界。对于独立的用户或安全主体，请使用单独的守护进程和外部编排器；请参阅[多会话与多工作区部署](#multi-session--multi-workspace-deployment)。

有关"阶段 1 中我们不会修复什么"的更详细枚举（单主机会话状态变更模型 + N 个并行会话共享每个工作区运行时内的一个 ACP 子进程），请参阅下方的[阶段 1 范围边界 — 阶段 1.5 中我们不会修复什么](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15)。

## 快速入门

### 远程 Web Shell 和手机访问 [#remote-web-shell-and-phone-access]

若要从另一台机器连接到正在运行的本地守护进程，请打开其 Web Shell 并前往 **设置 → 连接 → 允许远程连接**。默认情况下禁用远程访问。启用该功能后，如有提示请选择网络接口，并将显示的地址和 Bearer 令牌复制到另一台 Web Shell 的连接表单中。无需额外的终端命令或重启守护进程。

远程监听器提供与本地监听器相同的工作区和会话。它首先使用所选接口上的相同数字端口。如果该地址被占用，请在高级设置中选择不同的端口；Qwen 不会静默更改端口或停止其他服务。允许任意端口上 `localhost` 和 `127.0.0.1` 处的 HTTP 页面。高级设置接受额外的精确浏览器来源，包括 HTTPS 页面。

关闭访问权限或重置令牌会撤销现有的远程连接；本地客户端和守护进程拥有的运行中任务将继续执行。重新启用时会生成新令牌。此设置在守护进程重启之间不会持久化保存。令牌仅对授权的本地操作员可用。已通过显式启动/代理配置暴露的主监听器会被单独标记，且不会通过此开关关闭。

地址必须通过网络和防火墙可达。HTTP 不加密令牌；请使用受信任的网络或配置 HTTPS。HTTPS 页面无法连接到远程 HTTP 端点。UI 区分认证、策略和混合内容错误；通用的浏览器网络错误无法可靠地区分 CORS、证书和连接失败。

```bash
qwen serve --hostname 0.0.0.0
```

当既未提供 `--token` 也未提供 `QWEN_SERVER_TOKEN` 时，非回环监听器会生成一个 128 位的临时 Bearer 令牌（22 个 URL 安全字符），并在启动时打印一次。显式的标志值优先于环境变量；在非回环绑定上，显式的空值仍然会失败关闭并拒绝启动，而在回环上它会遮蔽 `QWEN_SERVER_TOKEN` 并使绑定处于 `--require-auth` 下描述的可信无令牌模式。默认的循环行为保持不变。

在通配符绑定上，启动时会从实际接口列出无需令牌的本地/网络 URL，并且——对于生成的令牌，或对于交互式终端中的你自己的令牌——为一个标记为私有局域网的地址提供**包含密钥的 QR 码**。通配符枚举仅列出 Local Control 所通告的相同私有/链路本地局域网集合（RFC 1918 / RFC 3927 IPv4，以及双栈绑定上的 fc00::/7 ULA IPv6）；用于排除 VPN 适配器和容器桥接的软件接口过滤器是一个**名称启发式规则** ([#9158](https://github.com/QwenLM/qwen-code/issues/9158))，而非保证，因此 k8s 覆盖网络名称（`cbr0`、`cali*`、`vxlan.*`）可能会漏过。显式的非回环绑定则打印并生成 QR 码，内容正是你选择的地址——包括可路由地址。在容器内，枚举出的地址是容器自身的接口，因此要访问已发布的端口需要替换为主机地址；分配了 pty 的容器被视为交互式终端，因此其日志仍包含密钥。扫描 QR 码即可打开内置 Web Shell，其中承载令牌位于 URL 片段中。浏览器会从 URL 中移除凭据并将其保留在每个标签页的 `sessionStorage` 中。或者，打开打印出的 URL 并输入令牌；缺失或过期的凭据会显示重试表单。生成的令牌会在重启时轮换。`--no-web` 会省略 QR 码，且通过管道/重定向的标准输出绝不会在 QR 码中重新发布稳定的操作员令牌——该情况会打印一个抑制提示，指明 `--token-qr` 加上一个仅含地址的 QR 码（Web Shell 会在到达时请求令牌）；若要无论如何都打印完整的包含令牌的 QR 码，请传递 `--token-qr` 或在用户、系统或系统默认设置中设置 `serve.tokenQr`；`--no-token-qr` 会在每次快速入门路径上抑制该次运行的快速入门令牌 QR 码，包括交互式终端和生成的令牌（后者仍会作为其自己的纯文本行打印）；它不控制 Local Control 配对 QR 码，后者由 `--local-control` 按设计打印。在无法打印 QR 码的地方请求 QR 码——例如 `--no-web`、未解析的 Web Shell 资源或回环绑定——会在 stderr 上说明原因，而不是静默地什么都不做。地址并不隐含防火墙或 NAT 可达性；不会自动发现公共 IP。

内置 Web Shell 的同源 **HTTP** 请求无需 `--allow-origin` 即可工作；其他浏览器来源仍然需要该允许列表，且 `Origin: null` 仍被拒绝。WebSocket 支持的功能（终端、语音）以及通过 TLS 终止反向代理访问守护进程的浏览器仍然需要显式的 `--allow-origin <origin>` 条目——转发头绝不被信任以建立同源关系。任何重写 `Host` 头的纯 HTTP 中间件也是如此：nginx 默认的 `proxy_set_header Host $proxy_host` 和 k8s Ingress 都会使守护进程看到一个不再与浏览器的 `Origin` 匹配的 `Host`。为你的浏览器实际看到的来源传递 `--allow-origin <origin>`，或配置代理以逐字转发 `Host`。在**非回环**绑定上，仅进行端口转换（`docker -p 8080:4170`）不需要任何额外操作——同源检查将 `Origin` 与转发的 `Host` 进行比较，从不查询监听端口。在默认的**回环**绑定上则不然：DNS 重绑定 Host 允许列表只接受守护进程自己的端口，因此进行端口转换的隧道（`ssh -L 8080:localhost:4170`）会对每个请求（包括 shell 文档）以 `403 Invalid Host header` 拒绝，且 `--allow-origin` 无法覆盖此行为——请转发相同的端口（`ssh -L 4170:localhost:4170`）或使用非回环绑定。**移动访问**配对 QR 码是根据请求它的方案的 `Host` 构建的——绝不根据转发头——因此在 TLS 终止代理后面，它保持守护进程自己的 `http` 方案，并且交换过程会拒绝手机的 `https` 页面，因为邀请绑定到发出它的来源。请在浏览守护进程直接地址时进行配对，或者在手机中输入令牌。承载令牌授予完整的守护进程 API 权限，包括代码执行。请将终端令牌和 QR 码捕获视为机密。HTTP 是未加密的；现有的 `--tls-cert` 和 `--tls-key` 选项可提供使用你自己证书的 HTTPS。

要在你自己的机器上使用 Web Shell 连接远程守护进程，请在连接屏幕或**守护进程状态**中输入远程守护进程的来源（例如 `https://dev-box.example:4170`）及其承载令牌。远程守护进程必须允许你本地页面的来源。固定端口上的浏览器标签页可以列出该来源，例如 `qwen serve --hostname 0.0.0.0 --allow-origin http://localhost:4170`；终端的 WebSocket 也需要该条目。**桌面客户端**不同：它从 `http://127.0.0.1:<OS-assigned port>` 加载自己的 shell，因此其页面来源在每次启动时都会变化，没有固定的条目可以匹配它。使用 `--allow-origin http://127.0.0.1:*` 显式选择该来源类，它为 REST API 和终端/语音 WebSocket 都允许该回环主机上的任意端口。优先使用它而不是 `*`：`*` 允许所有浏览器来源，且仅覆盖 REST，不覆盖 WebSocket 门控。令牌按标签页和按守护进程来源保存，绝不会复用于另一个守护进程。侧边栏一次只列出一个选定守护进程的工作区；切换守护进程会重新加载页面，并且不会合并本地和远程项目列表。使用现有的**添加工作区**表单来在选定的守护进程上注册绝对路径。如果链接的 `?daemon=` 命名了一个此浏览器之前未连接过的来源，则在你在连接屏幕上确认之前不会联系该来源。跨来源连接不提供浏览器本地文件桥接，无论是在独立还是嵌入式 Web Shell 中。HTTPS 页面无法连接到 HTTP 守护进程，因此在受信任的网络之外请同时通过 HTTPS 提供服务。

### 1. 启动守护进程（回环，无认证）

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: trusted loopback mode; local callers have full API access without bearer authentication, including code execution as the daemon user. Use --require-auth with QWEN_SERVER_TOKEN on shared or untrusted hosts.
```

默认绑定为 `127.0.0.1:4170`。Bearer 认证**关闭**，主监听器是受信任的，因此任何能访问该端口的本地进程都可以使用完整的运维 API，包括以守护进程用户身份执行代码。特定于路由的工作区信任、会话所有权、`X-Qwen-Client-Id`、权限、特性、验证和资源检查仍然适用。守护进程将当前工作目录注册为主工作区；使用绝对路径 `--workspace /path/to/dir` 可覆盖，重复该标志可注册额外的隔离运行时。

对于仅限 API 的守护进程，禁用 Web Shell。会话、提示词、工作区、权限和 SSE 路由保持不变；绑定到 Web Shell 的表面随之消失——Local Control 启用在所有平台上均失败关闭，且 `/live/*` 路由（以及在 macOS 上带有 `QWEN_SERVE_LIVE_NATIVE_HOST=1` 时的 `/live/host` WebSocket）不会被注册：

```bash
qwen serve --no-web
```

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

`workspaceCwd` 字段显示主要兼容工作区，以便客户端在 `POST /session` 上有意省略 `cwd`。当前客户端应从 `workspaces[]` 中选择受信任的条目，并在明确针对运行时时发送该条目的 `cwd`。`limits.maxPendingPromptsPerSession` 字段通告活动的每会话提示准入上限；`null` 表示禁用了该上限。`limits.maxTotalSessions` 通告可选的守护进程级新会话上限；`null` 表示无限制。

### 检查和控制在本地运行的守护进程 [#inspect-and-control-a-local-daemon]

`qwen serve` 会为每个活动监听器发布一个本地发现记录，因此第二个终端不必解析 stdout 或搜索 `ps`：

```bash
qwen daemon start --port 4170      # detached; waits for the discovery record
qwen daemon status                 # ports, PIDs, workspaces, and health
qwen daemon status --json          # one JSON object per daemon
qwen daemon status --detail        # version, uptime, sessions, and issues
qwen daemon logs --port 4170 -f    # follow the recorded log file
qwen daemon stop --port 4170       # SIGTERM the recorded process
qwen daemon restart --port 4170    # stop, then start with the recorded settings
```

记录位于运行时目录（`$QWEN_RUNTIME_DIR`、`$QWEN_HOME` 或 `~/.qwen`）下的 `daemon/daemon-<port>.json` 中。它们在 POSIX 上是 `0600`，且绝不包含承载令牌。崩溃守护进程留下的记录会被报告为 `stale`；`status --prune` 或 `stop` 会将其移除。`stop` 仅在监听器响应 `/health` 或其 PID 仍然存活后才发送 `SIGTERM`；`--force` 在优雅超时后添加 `SIGKILL`。当注册了多个守护进程时，请传递 `--port`；`stop` 也接受 `--all`。

`status --detail` 向守护进程请求其自身状态：版本、正常运行时间、活动会话数和错误计数。仅当记录表明守护进程使用 Bearer 令牌，且记录的进程处于存活、可寻址状态并在记录所述时间启动时，才会发送 `QWEN_SERVER_TOKEN`；若此进程无法寻址记录中的 PID 命名空间，则绝不发送 Bearer 令牌。若无令牌，需要 Bearer 令牌的守护进程会报告需要身份验证。

`qwen daemon start` 以分离模式生成 `qwen serve`，等待其发现记录，并打印绑定的 URL、PID、日志路径和停止命令。它会丢弃启动会话的标识符和私有能力绑定，使子进程成为全新的守护进程，保留操作员的模型/认证环境，并传递 `--no-token-qr` 以确保启动日志中不包含令牌。工作区会被规范化，相对运行时目录在生成前固定到启动目录，Windows 驱动器相对根目录会根据启动驱动器解析。非回环绑定需要 `QWEN_SERVER_TOKEN`；如果您想要临时令牌，请直接使用 `qwen serve`。启动日志为 `0600`，并在成功启动后删除。`--wait` 会等待直到运行时提供服务（无 `daemon_runtime_starting` 错误且未 `error`）；超时将保留启动日志并以非零状态退出。

对于具有可重用本地凭据的已认证后台守护进程，请通过环境变量提供稳定令牌，并选择启用令牌侧车文件：

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen daemon start --require-auth --save-token --wait
qwen daemon token --port 4170          # print the saved bearer; treat the output as a secret
qwen daemon token --port 4170 --remove # delete only the local sidecar
```

优先使用 `QWEN_SERVER_TOKEN` 而非 `--token`，后者在 Shell 进程列表中可见。`--save-token` 需要显式提供的令牌，若没有则拒绝生成。侧车文件位于与发现记录相同的运行时目录下，名为 `daemon/daemon-<port>-<pid>.token`；在 POSIX 系统上权限为 `0600`，且绝不会包含在发现记录或守护进程日志中。`qwen daemon stop` 会将其移除，而 `qwen daemon restart` 会将其传递给替换实例。`qwen daemon token --remove` 删除本地副本，但不会更改或撤销运行中守护进程的凭据；要轮换凭据，请使用新令牌停止并重新启动守护进程。普通的 `qwen serve`（包括 `--open-with-auth`）不会写入此侧车文件。

`qwen daemon restart` 通过 `daemon stop` 停止一个已注册的守护进程，并通过 `daemon start --wait` 在其记录的端口和主机名上重新启动它，同时保留其记录的启动工作区、Conversations 工作目录根路径、Web Shell 模式和 `--require-auth` 设置；`--web`/`--no-web` 和 `--require-auth`/`--no-require-auth` 会覆盖记录。持久化的工作区注册由新守护进程自行恢复，而不是作为 `--workspace` 重放。其他所有 `qwen serve` 选项（例如 `--profile`、`--channel`、`--allow-origin` 或速率限制）都会重置为默认值，因此如果守护进程配置了这些选项，请通过 `qwen serve` 重新启动。在停止任何内容之前，restart 会拒绝 HTTPS 守护进程、不再存在的启动工作区、从守护进程托管的 Shell（例如其 Web Shell 终端）内部运行的情况，以及没有 `--token` 或 `QWEN_SERVER_TOKEN` 的 Bearer 令牌守护进程；运行中的 Bearer 令牌守护进程必须接受该令牌，因此 restart 绝不会轮换凭据。仅保存在工作区 `.env` 或设置文件中的令牌不会被 `qwen daemon` 读取。只有当您传入 `--force` 时，它才会被转发给 `daemon stop`。如果记录的端口已被占用，守护进程将在下一个空闲端口启动，并且 restart 将以非零状态退出。

当前守护进程记录的 Conversations 根路径会被 `daemon restart` 保留，即使重启 Shell 中的 `QWEN_CONVERSATIONS_DIR` 已发生变化。没有此字段的旧发现记录将再次使用启动环境或默认值；它们无法保证之前的选择。若要选择不同的根路径，请停止守护进程并使用新值启动它。有关持久化和恢复要求，请参阅 [Conversations 工作目录](#conversations-working-directory)。

### 工作区注册容量

默认注册限制为 256。设置 `QWEN_SERVE_MAX_WORKSPACES=25 qwen serve --workspace /path/to/project` 以降低该限制；接受的值为 1 到 256 之间的十进制整数。无效值会导致启动失败。这是守护进程启动设置：项目 `.env` 和项目 `settings.env` 无法更改它。嵌入式调用者可以设置 `ServeOptions.maxRegisteredWorkspaces`，其优先级高于启动环境。

该限制计算主要工作区、注册的次要工作区和用户创建的临时工作区。内部 Conversations 运行时豁免于此限制。动态注册在达到容量时返回 `409 workspace_limit_reached`。`GET /capabilities` 和 `GET /daemon/status` 暴露 `limits.maxRegisteredWorkspaces`。

在默认注册容量为 256 的情况下，标准守护进程默认采用固定的全局会话上限 800，包括仅用一个工作区启动的守护进程。同样的会话默认值适用于任何配置的大于 25 的注册容量。`--max-total-sessions` 仍可覆盖它；`0` 会禁用它。在容量小于或等于 25 时，保持现有的默认行为：一个启动或恢复的工作区不受限制，多个工作区根据每个工作区的上限和数量推导总数。注册变更不会重新计算总数。这不会改变 ACP 子进程内存策略，也不保证 800 个安全并发会话。

通道控制独立支持最多 25 个工作区所有者，暴露为 `limits.maxChannelControlWorkspaces`。过渡过程还会计算为恢复而保留的所有者；在达到容量时，请在添加新所有者之前成功停止旧所有者上选定的所有通道。过大的过渡会返回 `409 channel_control_workspace_limit_reached`。`--channel all` 继续仅选择主要工作区。通道 SDK 超时保持不变。

持久化注册文件保留架构版本 1，并在 8 MiB 内支持最多 255 条次要记录。原始记录（包括过期别名）会消耗持久化槽位，直到被遗忘。如果完整的合法启动集超过配置的限制，启动将失败并保持文件不变。要降低容量，请先按之前的容量重新启动，遗忘足够的注册项，并在以更低的限制重新启动之前减少显式的 `--workspace` 参数。在降级到较旧的二进制文件之前，请备份该文件，并使用较新的二进制文件将其缩减至最多 24 条次要记录和 256 KiB。否则，较旧的二进制文件会拒绝该存储，仅使用显式工作区启动；其存储修改会在写入前失败。

### 调整会话实时状态轮询

Web Shell 默认每 **5 秒**刷新一次工作区会话实时状态。要使用不同的间隔，请在启动守护进程之前设置环境变量：

```bash
QWEN_SESSION_LIVE_STATE_POLL_INTERVAL_MS=10000 qwen serve --web
```

该值是毫秒级的整数，范围从 `1000` 到 `2147483647`。缺失或无效的值将回退到 `5000`。该间隔适用于该守护进程服务的所有工作区；更改后请重启守护进程并重新加载任何打开的 Web Shell 页面。本地会话操作和返回到可见标签页仍可能立即刷新。这仅更改实时状态轮询，而不更改完整会话目录轮询。

守护进程在 `/capabilities` 中发布有效间隔为 `sessionLiveStatePollIntervalMs`。Web Shell 使用该值，并在连接到省略该值的旧版守护进程时回退到五秒。SDK 使用者在选择自己的轮询计划时可以读取该值。

### 从守护进程运行通道

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

此模式是实验性的并由守护进程管理。它不会取代独立的 `qwen channel start` 命令：在没有 `--daemon-url` 的情况下，现有的 `qwen channel start`、`stop` 和 `status` 行为仍保持独立。使用 `qwen serve --channel` 时，显式选择优先，守护进程在监听前保留通道服务租约，如果初始工作器无法就绪则启动失败。在无标志启动时，守护进程从每个受信任的已注册工作区恢复 `serve.channels`，因此非主工作区配置为启动的通道会随守护进程一起恢复，而无需运行时 API 调用。如果两个来源都未选择通道，重型通道运行时保持未加载状态，并且直到第一次运行时 PUT 或配置自身 `serve.channels` 的工作区注册之前，不保留通道服务租约。守护进程启动后注册的受信任工作区也会恢复其自身的 `serve.channels`，每次守护进程运行仅一次：稍后再次注册它——在移除之后或其信任被重新配置之后——不会重复恢复，因此你在其间停止的通道保持停止状态。使用显式 `--channel` 启动守护进程完全跳过此步骤，使用 `qwen channel stop` (`DELETE /workspace/channel`) 停止通道也是如此，直到 `qwen channel set` 再次启用它们：注册工作区不是重新开启托管的请求。与启动恢复不同（后者跳过无法托管的名称并保留其余部分），包含此类名称列表的延迟工作区不会恢复其任何通道，且守护进程日志记录原因。注册工作区不会等待其通道启动。由无法托管它的工作区列出的通道名称会被跳过并记录日志，使其他工作区的通道保持运行；`all` 仍然仅适用于主工作区。如果就绪的工作器后来崩溃，守护进程继续运行，在有界重启策略下重新启动它，并在 `GET /daemon/status` 中报告其状态（包括 `channel_worker_exited` 警告）。

自动恢复在工作器启动前跳过无效的启动字段或验证或租约错误，记录其 `serve.channels` 来源，并保持无关设置生效。在工作器启动失败后，只有在清理成功时守护进程才继续运行。全局运行时启动超时和未确认的工作器停止保留正常的启动失败行为；在工作器终止未确认期间，服务租约保持持有。检查守护进程日志以查看跳过或失败的恢复。

存储的启动名称必须非空，没有前导或尾随空格，且不包含不安全控制字符或不可见字符。无效条目会被单独跳过并按数组索引记录日志。启动既不会将它们修剪为不同的实例名称，也不会重写设置。通道启动切换反映持久化配置，而运行时状态报告通道是否正在运行。

运行时控制暴露为 `GET`、`PUT` 和 `DELETE /workspace/channel`；SDK 辅助函数是 `getChannelWorkerControl()`、`setChannelWorkerSelection()` 和 `stopChannelWorker()`。PUT/DELETE/reload 使用严格的变更门控：受信任的回环主调用者可以在没有令牌的情况下使用它们，而其他部署需要操作员凭证。运行时选择故意是临时的：PUT 不编辑设置或启动选项，重启返回到显式的 `qwen serve --channel` 选择，否则返回到受信任的主工作区的 `serve.channels`，或者在两者都不存在时返回禁用。显式 CLI 和运行时命名选择按首次出现顺序进行修剪和去重；顺序得以保留是因为第一个通道可以影响共享模型选择。

守护进程支持的 `qwen channel set` 和 `qwen channel reload`，以及带有 `--daemon-url` 的 `status` 和 `stop`，无法发现由 `--open-with-auth` 生成的令牌。使用 `QWEN_SERVER_TOKEN` 并向这些客户端传递相同的值配合 `--token`，或省略认证开放模式。

守护进程在其 worker 启动时读取每个频道的设置（token、`proxy`、每频道 `model`）。要在不更改已提交选择的情况下重新读取设置，请调用 `POST /workspace/channel/reload`（SDK `client.reloadChannelWorker()`，或 `qwen channel reload`）。Reload 会重新解析工作区归属，并通过相同的回滚安全协调路径重启选定的 worker。`channel_control` capability 在运行时控制被接入时始终存在；`channel_reload` 仅在管理器启用时存在。持久化线程会从磁盘恢复。

每个选定通道的 `cwd` 必须解析为已注册的工作区，并且通道按该拥有工作区分组：单工作区守护进程运行一个工作器（与之前相同）；多工作区守护进程（`--workspace` 重复）为每个拥有选定通道的工作区运行一个工作器，每个绑定到该工作区的 cwd、`QWEN_DAEMON_WORKSPACE` 和环境覆盖层。要在非主工作区托管通道，在该工作区自身的 `.qwen/settings.json` 中定义它（不需要 `cwd`）或设置等于工作区路径的显式 `cwd`。仅在用户/系统范围内定义且没有 `cwd` 的通道在多个工作区之间是模糊的：显式的 `--channel` 选择会导致启动失败，而自动恢复会在启动工作器之前记录所有权错误并跳过该选择。`--channel all` 保持仅限主工作区（它托管主工作区的通道）并且不能与命名通道组合。

替换选择在停止任何东西之前预检配置、所有权和信任。它保持有序选择未改变的工作区工作器。如果更改的工作器无法启动，守护进程停止新工作器并恢复旧选择。如果即使经过 SIGKILL 守护进程也无法确认旧子进程退出，它保留 PID 租约并拒绝创建重复工作器。当至少一个请求的适配器连接时，工作器仍被视为就绪；然后 PUT 返回 `partial: true`，且 `/daemon/status` 为缺失的适配器报告 `channel_worker_partial_connect`。守护进程无法启动的 `serve.channels` 名称——配置的选择其工作器启动失败、启动无法归因的名称，或延迟注册的恢复留下的关闭名称——在 `/daemon/status` 上报告为 `channel_restore_failed`，并且当该工作区自身设置定义它时，在该工作区的通道列表中显示为 `error` 及其 `lastError`。名称保持未托管的其他原因仅在守护进程日志中。

当适配器拒绝 `connect()` 时，当前 worker 快照可能包含 `startupFailures` 条目，其中有频道、`phase: "connect"`、可选的适配器代码和凭据已编辑的消息。`qwen channel set`、`qwen channel reload` 和远程 `qwen channel status --daemon-url …` 会打印这些原因。如果在动态 set 或 reload 期间每个适配器都失败，命令会收到 `502 channel_worker_start_failed`；响应原因描述该次尝试，其 `state` 描述回滚后的结果。后续状态请求不会保留失败尝试。每个 worker 启动最多保留 64 个原因，适配器代码应被视为诊断性的而非稳定类别。初始 `qwen serve --channel …` 启动在没有适配器连接时仍然退出。

守护进程还为客户端 UI 和运维人员暴露只读运行时快照：`GET /daemon/status`、`GET /workspace/mcp`、`GET /workspace/skills`、`GET /workspace/providers`、`GET /workspace/env`、`GET /workspace/preflight`、`GET /workspace/:id/session-info`、`GET /session/:id/status`、`GET /session/:id/context`、`GET /session/:id/supported-commands`，以及 `GET /session/:id/tasks`、`GET /session/:id/lsp`、`GET /session/:id/resources` 和 `GET /session/:id/transcript`。

`GET /workspace/:id/session-info`（及其复数形式 `GET /workspaces/:workspace/session-info` 对应项）返回工作区的聚合会话计数：持久化的 `active` / `archived` / `total`，以及在有实时状态时的当前内存中 `live` 计数。注册的不可信次要工作区省略 `live`，因为其目录读取不查询实时桥接。分页的 `GET /workspace/:id/sessions` 列表不包含总数，因此这是用于回答“存在多少会话？”的专用界面——当计划或重复任务留下大量本地存储时非常有用。

> ⚠️ **磁盘扫描 — 请勿轮询。** 此端点遍历工作区聊天目录下的本地会话 JSONL 文件。响应始终包含 `expensive: true` 和 `cost: "disk_scan"`。请低频调用（手动刷新、运维工具、偶尔的 UI 加载）— 切勿在紧定时器上或每次侧边栏渲染时调用。浏览页面首选 `GET /workspace/:id/sessions`，获取实时内存会话计数首选 `GET /daemon/status`。带有 `truncated: true` 的响应意味着扫描达到了安全限制或无法分类每个候选文件，因此持久化计数是下限。

```bash
curl http://127.0.0.1:4170/workspace/$(python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.getcwd(), safe=''))")/session-info
# → {"active":450,"archived":30,"total":480,"live":2,"expensive":true,"cost":"disk_scan"}
```

`GET /session/:id/status` 返回单个会话的实时桥接摘要：`sessionId`、`workspaceCwd`、`createdAt`、可选的 `displayName`、`clientCount` 和 `hasActivePrompt`。当守护进程持有具有该 ID 的实时会话时，它用摘要回答 `200`，否则回答 `404`（主体为 `{ "error": …, "sessionId": … }`）。用它来轮询某个已知会话是否仍在运行（`hasActivePrompt`）或有多少客户端已连接（`clientCount`），而无需获取和扫描整个分页会话列表：

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

这是原始实时会话视图，因此 `clientCount` 和 `hasActivePrompt` 与 `GET /workspace/:id/sessions` 中的对应条目匹配——但这两个路由并非字节级相同。列表端点会使用持久化的会话存储数据来丰富每个项目：其 `createdAt` 是持久化的首个提示时间，并且会添加 `updatedAt` 以及一个从存储的标题或首个提示派生的 `displayName`。而 `/status` 则报告实时会话自身的 `createdAt`，省略 `updatedAt`，并且仅当在实时会话上设置了 `displayName` 时才返回它。

`GET /session/:id/lsp` 返回结构化的每会话 LSP 状态。启动守护进程时使用 `--experimental-lsp` 以在生成的 Agent 会话中启用 LSP；否则该路由返回 `enabled: false` 且没有服务器。

`GET /session/:id/resources` 返回来自该实时会话自身 Config 的经过净化的 Skill 和 MCP 快照。当会话可能从工作树或其他有效目录运行时使用它，这些目录的资源可能与基础工作区不同。此会话视图中省略了工作区拥有的 MCP 认证、池、预算和发现错误详情。调用前请检查 `session_resources` 能力。

`GET /daemon/status` 是整合的故障排查快照。默认的 `detail=summary` 仅读取内存中的守护进程状态（会话、权限、SSE/ACP 传输计数、速率限制拒绝、进程内存、已解析的限制），并且不会启动 ACP 子进程。当你正在积极调查问题时，使用 `GET /daemon/status?detail=full` 进行每个会话的诊断、ACP 连接详情、认证设备流计数以及工作区状态部分。

`GET /workspace/mcp` 报告实时的 ACP 运行时，并且在空闲时不启动 ACP 子进程；空闲的守护进程返回带有空快照的 `initialized: false`。一旦会话处于活动状态，它就会切换到 `initialized: true` 并显示真实状态。

`GET /workspace/providers` 由工作区设置和环境在守护进程本地回答，因此它不依赖于活动的 ACP 子进程，而 `acpChannelLive` 是存活信号。如果无法解析工作区设置或模型配置，响应将包含 `initialized: false`、一个空的 `providers` 数组和一个 `errors` 条目。只有当构建守护进程时没有守护进程本地的提供者状态构建器时，该路由才会回退到实时的 ACP 快照；守护进程本地的答案永远不会包含运行时注册的模型。

`GET /workspace/skills` 立即返回保留的守护进程观察结果并在后台重新验证，因此热读取不需要等待 ACP 子进程。可选的 `snapshot` 对象报告 `observedAt`、`ageMs`、`stale` 和 `refreshing`；在将目录视为最新之前检查 `ageMs`。在第一次成功的观察之前，一秒启动节流窗口内的读取可能会返回带有 `errors` 条目的 `initialized: false` 而不是等待；那是可重试的不可用性，而不是空目录。

要通过名称更新工作区 Skill 设置，请在检查 `workspace_skill_settings_toggle` 能力后调用 `POST /workspace/skills/:name/enable` 并传入 `{ "enabled": true | false }`。若要更改多个名称，请检查 `workspace_skill_settings_batch_toggle` 并调用 `POST /workspace/skills/enable` 并传入 `{ "skillNames": ["review", "deploy"], "enabled": false }`；它会一起处理所有结构上有效的名称，在最多一次锁定设置写入中持久化所有产生的声明变更，并在发生任何变化时刷新活动 ACP 会话一次。这些路由会写入工作区 `skills.disabled` 和 `skills.enabled`，而不会咨询已加载的 Skill 目录，因此名称可以在安装前或其 Extension 处于非活动状态时被禁用。启用操作会移除匹配的工作区禁用项并记录一个显式的 `skills.enabled` opt-in，即使是在安装之前，因此此条目可以覆盖 Extension 内部的 Skill 禁用。重复相同的声明是一个空操作（`changed: false`）。它们的路径和请求体保持不变；特定于设置的能力取代了已退役的经过目录验证的 Skill 切换标签。批处理 `errors` 数组为了保持线路兼容性而保留，对于结构上有效的名称它是空的。从更高作用域继承的硬性 `skills.disabled` 条目对有效可用性仍然具有权威性，但不会阻止工作区记录或移除其自身的声明。Skill 状态单元格暴露 `disabledReason`（`hard`、`default` 或 `inactive_extension`）和一个可选的 `lockedScope`。不受信任的工作区写入仍会被拒绝。`deferred` 响应意味着在存活检查时没有子进程处于活动状态，或者发生变化的请求在必需的刷新过程中失去了其子进程/会话；当 `changed` 为 true 时，持久化的声明将在子进程启动时生效。声明是否实际发生了更改由 `changed` 报告（在批处理请求的每个结果上）。`skills.disabled` 同时禁用手动使用和模型使用，这与 `disable-model-invocation: true` 不同，后者保留了直接的 `/skill-name` 调用可用。对于 V2 Extension 批处理，请检查 `extension_batch_activation_v2`：`PUT /extensions/activation` 更改全局默认值，而 `PUT /workspaces/:workspace/extensions/activation` 更改所选工作区的精确覆盖项并接受 `"inherit"` 以清除它们。两者都接受 `extensionNames` 中的名称；`enabled` 和 `disabled` 可以在安装前声明，而对于未知名称的 `inherit` 是一个空操作。每个请求返回一个用于轮询的操作。当广告了 `extension_activation_explicit_refresh` 时，该操作在激活策略提交后完成，并且不直接刷新活动会话。要立即应用它，请在激活成功后提交独立的主要或工作区限定的 Extension 刷新。如果没有这种显式刷新，其他工作区可以继续使用前一个激活，直到下一次 30 秒生成协调器通过为止；失败的协调将由后续通过重试。

无论 ACP 状态如何，`GET /workspace/env` 和 `GET /workspace/preflight` 总是以 `initialized: true` 回答。`env` 从不咨询 ACP（仅守护进程信息）；`preflight` 从 `process.*` 回答守护进程级别的单元格，并在子进程空闲时为 ACP 级别的单元格发出 `status: 'not_started'` 占位符。

`GET /workspace/env` 报告守护进程的运行时、平台、沙箱、代理以及白名单秘密环境变量（如 `OPENAI_API_KEY`）的**存在**（绝不是值）。代理 URL 在发送到网络之前会被剥离凭据并简化为 `host:port`。该路由始终直接从守护进程回答，并且绝不生成 ACP 子进程。

`GET /workspace/preflight` 返回就绪检查列表。**守护进程级别的单元格**（Node 版本、CLI 入口点、工作区目录、ripgrep、git、npm）始终渲染。**ACP 级别的单元格**（认证、MCP 发现、技能、提供者、工具注册表、出口）需要一个活动的 ACP 子进程——当守护进程空闲时，它们发出 `status: 'not_started'` 占位符，而不是仅仅为了填充它们而生成 ACP。失败映射到一个封闭的 `errorKind` 枚举（`missing_binary`、`auth_env_error`、`init_timeout`、`restore_timeout`、`protocol_error`、`missing_file`、`parse_error`、`blocked_egress`），以便客户端 UI 可以渲染结构化的补救措施。

守护进程还暴露了工作区文件辅助函数：

- `GET /file` 读取文本文件。全快照响应返回原始字节 `sha256:<hex>` 哈希；来自大于 256 KiB 文件的有限行窗口省略了它。
- `GET /file/bytes` 读取有界的原始字节窗口并返回 base64 内容。
- `POST /file/write` 创建或替换文本文件。
- `POST /file/edit` 应用一次精确的文本替换。

写入/编辑是**严格的变更路由**：无令牌的可信环回主监听器授予操作员权限；没有凭据的非可信嵌入返回 `token_required`。替换和编辑需要来自全快照 `GET /file`（或全窗口 `GET /file/bytes`）的最新 `expectedHash`。部分大文件窗口不能用作乐观并发令牌。`create` 绝不覆盖。允许显式写入被忽略的路径，但会进行审计。二进制写入、删除/移动/mkdir 以及递归父创建不属于此表面的一部分。

### 3. 打开会话

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

可以省略 `cwd` — 路由将回退到守护进程的主工作区。提交无法规范化为任何已注册工作区的 `cwd` 会返回 `400 workspace_mismatch`。

第二个客户端向 `/session` 发布针对同一解析后的工作区运行时，在默认的 `sessionScope: 'single'` 下会得到 `"attached": true`——现在他们共享该运行时的代理会话。省略 `cwd` 解析为主要；选择另一个注册的工作区会创建或附加到该运行时的单独默认会话。

### 4. 订阅事件流（先在另一个终端中执行）

```bash
SESSION_ID="<from step 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

`data:` 行是**完整的事件信封** — `{id?, v, type, data, originatorClientId?}` — 在单行上进行 JSON 字符串化。ACP 负载（本例中的 `sessionUpdate` 块）位于该信封内的 `data` 下。SSE 级的 `id:` / `event:` 行是为了方便 EventSource 客户端；相同的值也出现在 JSON 信封内，因此 raw-`fetch` 消费者也能获取它们。

在发送提示词**之前**打开此选项——SSE 重放缓冲区保存最后 8000 个事件，因此迟到的订阅者可以通过 `Last-Event-ID` 赶上进度，但对于简单的“监视单个提示词”情况，最简单的方法是先订阅并让它实时流式传输。

流发出 `session_update`（LLM 块、工具调用、使用情况）、`permission_request`（工具需要批准）、`permission_resolved`（有人投票）、`model_switched`、`model_switch_failed` 以及终止帧 `session_died`（代理子进程崩溃——然后 SSE 关闭）和 `client_evicted`（你的队列溢出——然后 SSE 关闭）。

### 5. 发送提示（回到原始终端）

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

步骤 4 中的 `curl -N` 会在帧到达时打印它们。

### 可选 Todo 停止守卫

长时间运行的守护进程客户端可以选择有限的延续，当前工作链成功写入顶级 Todo 列表后停止且仍有待处理或进行中的项目。将此添加到 `settings.json` 并重启守护进程：

```json
{
  "experimental": {
    "todoStopGuard": true
  },
  "tools": {
    "todoWrite": {
      "enabled": true
    }
  }
}
```

守卫在没有新用户输入的情况下最多添加两个连续的主模型调用。回合中间的用户消息首先运行并开始一个新的两尝试阶段；重试/继续和相关的后台结果保留当前阶段的预算。每次调用和最终的耗尽状态都作为可重放的 `session_update` 事件出现，带有 `_meta.source: "todo_stop_guard"`；元数据包括尝试次数和未完成计数，但绝不包含 Todo 文本。排队的完整提示词也首先运行，现有的权限/取消规则保持不变。

当武装链等待相关的后台工作时，无关的 cron/loop 触发和旧任务通知会被推迟。重复性工作是有界的，并且在链让出之前按任务合并。

该选项默认为 `false`，需要重启才能生效，并且在安全模式、裸机模式和 Approval `plan` 模式下强制关闭。它仅存在于内存中：从磁盘加载 Todo 状态或重启守护进程不会激活它。在 settings.json 中设置 `tools.todoWrite.enabled` 并重启 Qwen Code，然后新的普通提示必须成功运行其自身的顶层 `todo_write`；重试/继续和实时客户端重新连接会保留当前的内存工作链。成功更改会话工作目录会清除该状态，以便旧的 Todo 无法在新工作区中恢复。

## 身份验证 [#authentication]

对于任何超出回环地址的请求，每个 API 请求都需要一个 bearer token。为可复用客户端提供一个稳定的 token，或者在不提供 token 的情况下启动，并使用守护进程生成并打印的临时 token：

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → uses QWEN_SERVER_TOKEN; generates an ephemeral token if neither token source is supplied
```

客户端随后在正常 API 请求中发送 `Authorization: Bearer <token>` — 如果你导入了一个则为 `$QWEN_SERVER_TOKEN`，或者如果守护进程生成了它，则使用启动时打印的 bearer（该路径从不设置环境变量，因此请从启动输出中复制值）。**仅在普通回环绑定上**豁免 `/health`，以便 Pod 内的 k8s/Compose 存活探针无需凭据。在非回环绑定上（如 `--hostname 0.0.0.0`），`/health` 与其他正常 API 路由一样需要 token — 否则攻击者可以探测任意地址以确认守护进程的存在。Channel webhook 入口在所有模式下都是独立的，并使用其配置的 `x-qwen-webhook-secret` 而不是守护进程的 bearer。使用 `/capabilities` 端到端验证你配置的 token 是否正确：

> **加固回环 (`--require-auth`)。** 默认的回环无 token 行为对于单用户笔记本电脑是可以接受的，但在共享开发主机、CI 运行器或多租户工作站上是不安全的，因为在这些环境中任何本地用户都可以 `curl 127.0.0.1:4170`。传递 `--require-auth` 以使 bearer token 在每个正常 API 路由上成为必需项 — 包括 `/health` 和 `/capabilities` — 即使绑定到 `127.0.0.1`。Channel webhook 入口仍然由 `x-qwen-webhook-secret` 独立进行身份验证。Web Shell 文档和资源路由保持预认证状态；使用 `--no-web` 移除它们。当没有解析到 token 源时，启动失败，而在回环上这意味着 `--token`、`QWEN_SERVER_TOKEN` 或 `--open-with-auth` — 最后一种会在启动前安装其自身生成的 token，因此 `--require-auth --open-with-auth` 可以启动。生成密钥取决于 `--hostname` 拼写：回环拼写（`127.0.0.0/8`、`localhost`、`::1`、`[::1]`）从不生成，而任何其他拼写 — 包括恰好解析为回环的 DNS 名称 — 都会生成满足 `--require-auth` 并在启动时打印的临时 bearer（当 socket 绑定到回环时仅为 token），每次重启时轮换，因此为可复用客户端固定 `--token` 或 `QWEN_SERVER_TOKEN`。启用该标志后，**未认证**的客户端无法读取 `/capabilities` 来发现需要身份验证；发现面是 401 响应体本身。一旦经过身份验证，`caps.features.require_auth` 标签是一个认证后的确认，表明部署已加固（适用于审计/合规 UI）：
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
# Paste the bearer the daemon printed at startup, or your own QWEN_SERVER_TOKEN.
TOKEN='<printed bearer>'
curl -H "Authorization: Bearer $TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Wrong token → 401
```

token 比较是恒定时间的（SHA-256 + `crypto.timingSafeEqual`）；401 响应在"缺少 header"、"错误 scheme"和"错误 token"之间是统一的，因此侧信道无法区分。

`--open-with-auth` 是 CLI 拥有的便利功能，不是另一个守护进程 token 来源：当该选项已定义时（即使是空白），它选择 `--token`，否则选择 `QWEN_SERVER_TOKEN`，然后修剪选定的值，仅在结果为空时生成。守护进程不会持久化生成的值，也不会将其导出为 `QWEN_SERVER_TOKEN`；现有的内部已认证子进程交接保持不变。Web Shell 仅将浏览器副本存储在接收标签的 `sessionStorage` 中；此模式不添加跨标签或外部客户端的凭据发现机制。该 token 不可独立撤销，也不与客户端身份绑定。持有者获得与任何其他 bearer token 相同的守护进程权限。请参阅[已认证 Web Shell 启动设计](../design/2026-08-22-serve-open-with-auth.md)以及 [#4514](https://github.com/QwenLM/qwen-code/issues/4514) 中的相关后续工作。

## HTTPS / TLS（用于移动设备 / 跨设备访问） [#https--tls-for-mobile--cross-device-access]

默认情况下，守护进程提供纯 HTTP。这在 `localhost` 上没问题，但手机或平板通过 LAN IP（`https://192.168.x.x:4170`）访问时，通过 `http://` **不是** [安全上下文](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) — 因此浏览器会阻止 `getUserMedia`（语音输入）、WebRTC 和其他仅限安全上下文的 API。传递 `--tls-cert` + `--tls-key` 以通过 HTTPS 提供 Web Shell 并解锁它们：

```bash
# 1. Install a local CA and trust it (one-time). The mobile device must
#    also trust this CA — mkcert prints where the root cert lives.
mkcert -install

# 2. Generate a cert for your machine's LAN IP. Add localhost / 127.0.0.1 to
#    the SANs too: with `--open`, the daemon rewrites the browser URL to
#    127.0.0.1, so a cert scoped to only the LAN IP would be rejected with
#    ERR_CERT_COMMON_NAME_INVALID. (mkcert names the output after all hosts.)
mkcert 192.168.1.100 localhost 127.0.0.1

# 3. Start the daemon over HTTPS. Non-loopback binds still require a token,
#    and the browser Origin must be allowed through CORS.
qwen serve \
  --hostname 0.0.0.0 \
  --token "$(openssl rand -hex 32)" \
  --tls-cert "./192.168.1.100+2.pem" \
  --tls-key "./192.168.1.100+2-key.pem" \
  --allow-origin "https://192.168.1.100:4170"
# → qwen serve listening on https://0.0.0.0:4170
```

注意：

- **两个标志都要有或都没有** — 如果只给出其中一个，启动将失败（没有密钥的证书无法启动 HTTPS 监听器）。
- **TLS 与身份验证正交** — HTTPS 加密传输层；当配置了 bearer token 时，它会限制除普通回环绑定上的 `/health` 之外的正常 API 路由。传递 `--require-auth` 以同时限制回环 `/health`。Channel webhook 入口始终使用其自己的共享密钥。无论是否有 TLS，非回环绑定始终携带一个 token — 你传递的那个，或者守护进程生成并在启动时打印的临时那个。
- **作用域仅限 TLS 终端** —— 不支持自动生成，不支持 ACME / Let's Encrypt。这主要是为了局域网/开发环境的便利；对于面向互联网的部署，请在反向代理处终止 TLS（参见下方的威胁模型）。
- **Channel workers 通过 `https://` 拨号回守护进程** — 因此它们也需要信任服务证书。自签名证书（或包含其根证书的 fullchain）不需要额外操作：守护进程将其注入每个 worker 的 `NODE_EXTRA_CA_CERTS` 中。上述 mkcert 流程是 **CA 签发的**，因此仅叶证书无法锚定链 — 在使用 `--channel` 启动之前，在守护进程的启动环境中导出 `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"`。操作员设置的值会与守护进程证书 _合并_，而不是替换。如果没有它，守护进程会绿色启动，但每个 channel worker 都会在 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 上重启循环；守护进程日志在启动时会指出这一缺口。
- **IPv6 通配地址绑定会回退到本机实际分配的回环地址**。`--hostname ::`（或 `[::]`）会绑定一个 IPv6 套接字。（空的 `--hostname` 不会传给监听器。启动时会在绑定之前将它视为配置错误并拒绝启动，因此未设置 `HOSTNAME` 的 Compose 文件会明确报错，不会悄悄绑定通配地址。）该套接字支持双栈（Node 为它固定了 `IPV6_V6ONLY=0`，因此 `net.ipv6.bindv6only` 内核参数不会改变这一点），通常两个回环地址都可以访问。完全没有 IPv4 的主机只有 `::1`，而绑定 `::` 但未在回环接口上分配 `::1` 的主机（例如 `net.ipv6.conf.lo.disable_ipv6=1`）只有 `127.0.0.1`。如果主机分配了 `[::1]`，工作进程会连接该地址，否则会连接 `127.0.0.1`。用于 IPv6 通配绑定的服务证书应在 SAN 中包含两个回环地址（`mkcert localhost 127.0.0.1 ::1` 涵盖此情况）。启动时的信任诊断会检查工作进程实际连接的 URL，并指出缺少的配置。`--hostname 0.0.0.0` 保持原样，仍然需要 `127.0.0.1`。
- **原地轮换 `--tls-cert` 需要重启守护进程** —— 守护进程提供的是启动时读取的字节，因此在重启之前，重新生成的 worker 可能加载比守护进程呈现的更新的内容，导致握手失败。

## 将 Web Shell 安装为应用

在受支持的浏览器上，打开守护进程的 Web Shell 并使用浏览器的 **安装应用** 或 **添加到主屏幕** 操作。安装的应用会在独立窗口中打开同一服务器，并显示 Qwen Code 的名称和图标。在 iOS 上，使用浏览器的共享菜单和 **添加到主屏幕**。可用性取决于浏览器和设备。

守护进程本身提供 PWA 元数据：`GET /manifest.webmanifest` 和 `GET /sw.js` 是预认证路由（浏览器在任何 Authorization 标头存在之前获取两者），并且 `sw.js` 与 `Service-Worker-Allowed: /` 一起提供服务，因此其作用域覆盖整个源。Worker 仅缓存内容哈希的 Vite 构建资源，采用缓存优先策略。未哈希的公共图标和清单通过 HTTP 重新验证。API 请求、事件流以及携带授权标头的请求保持在网络上。

对于手机或其他远程设备，请使用受信任的 HTTPS 连接；本地开发支持 `localhost` 或回环地址上的 HTTP。局域网 IP 上的纯 HTTP 不会启用 Service Worker。请参阅上面的 TLS 说明；安装不会绕过证书或身份验证检查。

安装始终启动服务器根目录。当前地址中的令牌、会话链接或工作区永远不会包含在应用的启动 URL 中。您可能需要在安装的应用中再次输入令牌：它使用现有的 Web Shell 身份验证流程，并且不添加持久化凭据存储。

服务器必须保持运行且可达。在 Service Worker 激活并接管页面后，如果连接失败时打开根目录或会话链接，将显示重试页面。Service Worker 缓存中不会保存任何对话、文件、API 响应或凭据。现有的 HTTP 错误仍来自服务器。此第一步不提供离线工作、Web Push 或应用关闭时的通知。更新后的 Worker 使用 `skipWaiting()` 和 `clients.claim()` 立即激活，替换打开标签页中的先前 Worker 而不强制重新加载页面。激活会移除较旧的 Qwen shell 缓存并保留无关缓存。

安装元数据使用内置的 Qwen Code 标识；运行时自定义品牌仍在 Web Shell 内部应用。嵌入式库使用者不注册 Worker。要移除安装，请使用您的浏览器或操作系统的应用管理功能；要移除其 Service Worker 和存储的站点数据，请使用浏览器的站点设置。

## Qwen Live（实验性）

Qwen Live 在所有平台上均通过 Web Shell 运行：浏览器标签页充当麦克风和扬声器（WS `/live/web`），因此请通过 `https` 或 `localhost` 打开 Web Shell 以获取麦克风访问权限。原生 macOS `Qwen Live Host` 应用默认处于关闭状态；若要尝试使用，请启动带有 `QWEN_SERVE_LIVE_NATIVE_HOST=1` 的 macOS 守护进程，这将在启用 Live 时恢复 `/live/host` WebSocket、`realtime_voice` 功能以及 Host 下载。如果没有它，已安装的 `Qwen Live Host.app` 仍将无法连接（守护进程不会注册 `/live/host`）；请退出并使用 Web Shell。

## CLI 参数

| 标志 | 默认值 | 用途 |
| --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>` | `4170` | TCP 端口。`0` = OS 分配的临时端口。 |
| `--hostname <addr>` | `127.0.0.1` | 绑定接口。除回环地址以外的任何绑定都需要令牌；当 `--token` 和 `QWEN_SERVER_TOKEN` 均未提供令牌时，将生成一个临时令牌并在启动时打印。 |
| `--local-control` | `false` | 在一个选定的私有 IPv4 接口上共享 Web Shell，使用由守护进程拥有的可撤销配对令牌、终端 QR 码、精确的浏览器来源以及尽力而为的睡眠抑制。可与 `--token`、`--allow-origin` 和 `--port 0` 组合使用；与 `--no-web` 和非默认的 `--hostname` 冲突。当有多个 LAN 候选项可用时使用 `--local-control-address`，并为语音输入等安全上下文浏览器 API 添加 `--tls-cert` + `--tls-key`。 |
| `--local-control-address <ip>` | — | 当主机有多个候选项时要共享哪个 LAN IPv4 地址。仅当 `--local-control` 报告选择有歧义时才需要。 |
| `--token-qr` | — | 即使 stdout 被捕获（不是交互式终端）且持有者是操作员提供的（稳定）令牌时也打印包含令牌的 QR 码，默认情况下会隐藏稳定凭据以避免其进入收集的日志。也可以通过 `serve.tokenQr` 设置进行配置，仅在用户、系统和系统默认范围内生效；如果传递了标志，则标志优先。省略该标志**不**等同于 `--no-token-qr`：省略保留默认策略（在交互式终端或为生成的令牌显示 QR 码），而 `--no-token-qr` 会在每次快速启动路径上抑制该次运行的启动快速入门令牌 QR 码，因此可以按运行否决持久化设置。两者都不控制 Local Control 配对 QR 码。 |
| `--token <str>` | — | Bearer token。回退到 `QWEN_SERVER_TOKEN` 环境变量（去除首尾空白字符——便于使用 `$(cat token.txt)`）。非环回绑定且两者均未提供时，会生成临时令牌。显式设置为空值时，在非环回绑定上仍拒绝启动；在环回绑定上则屏蔽环境变量并选择无令牌的受信模式（或在 `--require-auth` 下直接拒绝）。 |
| `--require-auth` | `false` | 即使是在环回地址上，若没有 bearer token 也拒绝启动。针对共享开发主机 / CI 运行器 / 多租户工作站加固了 `127.0.0.1` 开发者默认设置，因为在这些环境中任何本地用户都可以访问监听器。此快速失败机制仅适用于环回：环回仅在具备三种令牌来源之一时才会启动 —— `--token`、`QWEN_SERVER_TOKEN` 或 `--open-with-auth`（后者会在启动前安装其生成的令牌，但生成过程在环回模式下被抑制）——而在非环回绑定上，生成的临时令牌满足该标志要求。同时将 `/health` 置于 bearer 验证之后。 |
| `--enable-session-shell` | `false` | 启用直接会话 Shell 执行。需配置 bearer token 或使用受信环回模式方可生效；调用仍需有效的会话绑定 `X-Qwen-Client-Id`。 |
| `--tls-cert <path>` | — | PEM 证书文件路径。使用 **HTTPS** 而非 HTTP 提供服务。必须与 `--tls-key` 配对使用（仅提供其中一个会导致启动失败）。解锁局域网 IP 上的安全上下文浏览器 API —— 语音输入 (`getUserMedia`)、WebRTC —— 否则浏览器会在普通 `http://` 上阻止这些功能。仅进行 TLS 终止；不支持自动生成 / ACME。请参阅下方的 [HTTPS / TLS](#https--tls-for-mobile--cross-device-access)。 |
| `--tls-key <path>` | — | PEM 私钥文件路径。必须与 `--tls-cert` 配对使用。 |
| `--max-sessions <n>` | `32` | 并发活动会话的上限。当达到上限时，新的 `POST /session` 请求若试图生成新子进程将返回 `503`（附带 `Retry-After: 5`）；附加到现有会话不计入在内。设为 `0` 可禁用限制。也可通过 `serve.maxSessions` 设置（仅限 user、system 和 system-defaults 作用域）；传入标志位时以标志位为准。按单用户 / 小团队规模设计；如果部署环境有足够的 RAM/FD 余量（每个会话约 30–50 MB），可提高此值。 |
| `--max-total-sessions <n>` | `800` 或派生值 | 可选的非负整数，作为守护进程范围内所有已注册工作区运行时创建新会话的总上限。适用于新建子会话、会话恢复以及分支/分叉创建的会话；附加到现有活动会话不占用名额。设为 `0` 表示无限制。当注册容量超过 25（包括默认的 256）时，默认为 800。当容量为 25 或更少时，一个启动或恢复的工作区不受限制；多个工作区根据每工作区限制及其数量推导总数。后续动态注册不会重新计算此值。 |
| `--max-pending-prompts-per-session <n>` | `5` | 每个会话中由 `POST /session/:id/prompt` 接受但尚未完成的提示词上限，包括排队中的提示词和当前活跃的提示词。桥接器在返回 `promptId` 之前，会同步拒绝溢出请求，返回 `503`、`Retry-After: 5` 和 `code: "prompt_queue_full"`。设为 `0` 可禁用限制。`branchSession` 在同一 FIFO 队列上序列化，但不计入此提示词上限。 |
| `--workspace <path>` | `process.cwd()` | 此守护进程注册的绝对工作区目录。重复使用该标志可在单个进程中托管多个工作区；第一个为主工作区，当请求省略 `cwd` 时仍作为默认值。相对路径会被拒绝。规范化的 `cwd` 未注册在会话请求中的，将返回 `400 workspace_mismatch`。 |
| `--conversations-dir <path>` | — | 独立会话和实时会话的绝对 Conversations 工作目录根路径。覆盖 `QWEN_CONVERSATIONS_DIR`；若两者均未设置，则使用 `~/Documents/Qwen Code/Conversations`。`qwen daemon start` 也接受此参数。请参阅 [Conversations 工作目录](#conversations-working-directory)。 |
| `--memory-project-scope <mode>` | `workspace` | 项目记忆分区模式。`workspace`（默认值）按确切的已注册工作区目录键控记忆，使每个守护进程工作区拥有独立的隔离记忆；`git-root` 是兼容旧版模式，解析到相同 Git 根目录的工作区共享记忆。提供时覆盖 `QWEN_CODE_MEMORY_PROJECT_SCOPE`；空的环境变量值视为未设置，而无法识别的非空值会被忽略并给出一次性警告，保留旧的 `git-root` 行为。新默认值不会迁移现有的基于 git-root 的项目记忆——在迁移期间请使用显式的 `git-root` 作用域来读取这些条目。 |
| `--channel <name\|all>` | — | 实验性的守护进程管理的通道 worker。重复使用该标志可选择多个已配置的通道，或传入 `all` 以启动所有已配置的通道。`all` 不能与命名通道组合使用。选定的通道 `cwd` 值必须解析为已注册的工作区；多工作区守护进程会为每个所属工作区运行一个 worker。Worker 由 `qwen serve` 管理；停止守护进程即可停止 serve 管理的通道。 |
| `--max-connections <n>` | `256` | 监听器级别的 TCP 连接上限 (`server.maxConnections`)。无论会话数量如何，都限制原始套接字计数——一旦达到上限，慢速 / 幽灵 SSE 客户端将在 accept 时被拒绝。如果您的部署预期每个会话有许多 SSE 订阅者，请同时提高 `--max-sessions`。 |
| `--memory-budget-mb <n>` | cgroup/主机的 50% | 整个守护进程进程树的总内存预算（单位：MB）。未设置时，派生自 cgroup 限制或主机内存的 50%；无论哪种情况，有效值均受限于解析出的可用内存，并且会报告配置值和有效值。它驱动由 `--child-heap-mode` 选择的固定 ACP 分区和自适应实时日志增长；这不是总 RSS 限制：一个守护进程范围的增长池，派生自有效预算的 5%（上限为 `1024` MB；在报告 `insufficientMemory` 的主机上，池大小为 0 且禁用自适应增长），由每个工作区桥接器共享——参见 `--max-journal-bytes`。解析后的数值显示在 `GET /daemon/status` 的 `limits.memory` 下，连同已注册和活动子进程计数以及 `runtime.memory` 下的建议每子进程份额。对于低于最小值的主机，报告 `insufficientMemory` 而不是向上钳制；由于派生比例为 50%，任何小于约 2 GB 的主机都会触发此情况。在此类主机上传递显式的 `--memory-budget-mb 1024` 以覆盖派生值（该标志仍要求至少 1024 MB 的可用内存才能清除警告）。必须是 `[1024, 1048576]` 范围内的整数。 |
| `--memory-pressure-mode <mode>` | `observe` | 守护进程是否将其自身的内存读取结果转化为判定。`observe`（默认）在 `GET /daemon/status` 的 `runtime.memory.pressure` 下报告压力级别，并在级别离开 `normal` 时提出一个 `daemon_memory_pressure` 问题——这是一个 `warning`，因此整体 `status` 保持 `ok` 不变。`off` 仍然报告所有数据（包括级别），但不提出问题，因此整体 `status` 保持不变；在校准期间或如果您针对顶层状态设置警报，请使用此模式。级别是两个比率中的较差者：RSS 与可用内存之比（cgroup OOM killer 监控的对象）以及 V8 堆使用量与该进程的堆上限之比。它仅涵盖守护进程根进程；请将其与 `runtime.memory.children.rssBytes` 进行比较以了解子进程情况。两种模式下均不执行补救措施。取值为 `off`、`observe` 之一。 |
| `--child-heap-mode <mode>` | `observe` | `off` 禁用分区；`observe` 报告 `limits.memory.childHeap` 而不改变生成行为；`admit` 仅强制执行建模的并发子进程数量。实验性选择加入项 `enforce` 还会为每个受管理的 ACP 子进程提供固定的 `perChildCeilingMb` 旧空间上限，并报告 `limits.memory.enforced: true`。两种准入模式都可能在拒绝之前回收一个符合条件的空闲 ACP，拒绝代码为 `acp_child_capacity_exhausted`；活动会话仍受保护。注册独立于子进程容量。零槽位准入配置会导致启动失败。继承的固定 Node 堆标志在 `enforce` 中会被规范化；百分比标志会产生冲突并被拒绝。该上限限制的是旧空间，而非 RSS 或 MCP 后代。启用前请校准您的工作负载；零拒绝次数并不能证明堆安全性。模式和预算更改需要重启守护进程；使用 `admit` 重启以回滚堆强制执行。 |
| `--event-ring-size <n>` | `8000` | 每会话 SSE 重放环形缓冲区深度（#3803 §02 目标）。设定 `GET /session/:id/events` 配合 `Last-Event-ID: N` 可用的积压量。更大 = 更多的重连余量，但代价是每个会话额外占用几百 KB RAM。SDK 客户端还可以通过对特定订阅使用 `?maxQueued=N` 请求更大的每订阅者积压上限（范围 `[16, 2048]`，默认 256）。守护进程还会在队列填充率达到 75% 时发出一个非终止的 `slow_client_warning` SSE 帧，以便客户端在被驱逐前进行排空/重连。预检 `caps.features.slow_client_warning`。 |
| `--compacted-replay-max-bytes <n>` | `4194304` | 由 `POST /session/:id/load` 返回的有界快照中保留的重放事件的每活动会话字节上限。该上限适用于 `compactedReplay`；当前正在进行的 `liveJournal` 单独受 `--max-journal-events` 和 `--max-journal-bytes` 限制（自适应增长可提高这些基线上限——参见 `--max-journal-bytes`）。值必须为正安全整数；无效值将在启动时导致失败，硬上限为 256 MiB。当较旧的保留重放被丢弃时，快照将以 `history_truncated` 开头。这不会限制磁盘上的转录记录。 |
| `--max-journal-events <n>` | `10000` | 每会话基线上限，用于限制当前未完成轮次中正在进行 `liveJournal` 内保留的重放条目数。连续的兼容文本或思维块共享一个条目，每个条目最多包含 256 个源事件；其他事件边界得以保留。当超出上限时，守护进程首先尝试自适应增长（参见 `--max-journal-bytes`）；如果未授予余量或授予的余量不足以覆盖超额部分，则丢弃最旧的条目并在前面添加一个 `history_truncated` 标记。该标记的 `truncatedEvents` 和 `retainedEvents` 计数描述的是源事件。必须为正安全整数。固定此标志（或 `--max-journal-bytes`）会禁用自适应增长。 |
| `--max-journal-bytes <n>` | `8388608` | 每会话基线字节上限，用于限制正在进行 `liveJournal` 的大小，即使兼容块共享一个重放条目，也根据序列化的源事件进行计算。当轮次超出上限时，自适应增长会将会话的上限提升至接近双倍（最高至每会话 256 MiB 的硬上限，受剩余池余量限制），只要在所有守护进程活动会话间授予的增长总量能容纳在一个共享增长池中即可。该池的大小为守护进程有效内存预算的 5%——即传入时的 `--memory-budget-mb` 值，上限为解析出的可用内存，否则为自动检测内存的 50%（参见 `--memory-budget-mb`）——上限为 `1024` MB；在报告 `insufficientMemory` 的主机上，池大小为 0 且禁用自适应增长。增长按需发生，且仅在池允许的范围内进行；当增长被拒绝、池耗尽或授予的额度不足以覆盖超额部分时，最旧的条目将被整体丢弃（始终至少保留一个条目），因此保留的尾部可能远小于上限。固定此标志（或 `--max-journal-events`）会禁用自适应增长。必须为正安全整数。默认为 8 MiB。 |
| `--mcp-client-budget <n>` | — | 活动 MCP 客户端的正整数上限。当宣告 `mcp_workspace_pool` 时，上限和传输方式在工作区运行时之间共享；当缺少该标签时，遗留的每会话管理器强制执行此限制。请与 `--mcp-budget-mode` 结合使用。未设置时，不进行基于计数的强制执行（但 `GET /workspace/mcp` 仍会报告 `clientCount`）。这与 claude-code 的 `MCP_SERVER_CONNECTION_BATCH_SIZE` 不同，后者限制的是启动并发数而非总活动客户端数。预检 `caps.features.mcp_guardrails` 和 `caps.features.mcp_workspace_pool`。 |
| `--mcp-budget-mode <m>` | `warn` / `off` | `--mcp-client-budget` 如何强制执行。`warn`（设置预算时的默认值）：无拒绝，快照的 `budgets[0].status` 在达到预算的 ≥75% 时翻转为 `warning`。`enforce`：超过上限的连接将被拒绝，每个服务器单元格显示 `disabledReason: 'budget'`，按 `mcpServers` 声明顺序确定性地执行。`off`（未设置预算时的默认值）：纯可观测性。启动时会拒绝没有预算的 `enforce`。 |
| `--external-tool-guard-mode <m>` | `off` | 受管理的 ACP 外部预执行策略。`off` 不进行任何提供者调用且不宣告任何能力。`required` 除非兼容的提供者完成 v1 握手，否则启动失败，然后除非其单个准备请求被允许，否则封闭地失败每个支持的顶层工具调用。 |
| `--external-tool-guard-endpoint <url>` | — | 仅在 `required` 模式下使用的仅限来源的回环 HTTP(S) 提供者 URL，例如 `http://127.0.0.1:8787`。不接受路径、URL 凭据、重定向、非回环主机和代理路由。 |
| `--external-tool-guard-timeout-ms <n>` | `3000` | 整数 `100..30000`；独立应用于启动握手和每个准备请求。 |
| `--http-bridge` | `true` | 阶段 1 模式：生产环境尝试预热一个主要 `qwen --acp` 子进程以兼容，并在首次使用后失败时重试，而每个可信次要进程可以按需启动一个子进程。针对运行时的会话通过 ACP `newSession()` 多路复用到其子进程；不可信次要进程无法启动 ACP。阶段 2 原生进程内功能稍后可用。 |
| `--initialize-timeout-ms <n>` | `10000` | ACP 子进程请求超时时间，包括 `initialize` 握手（毫秒）。必须是正整数，最大为 `2147483647`。高于 JS 定时器上限（`2^31-1`）的值会在启动时被拒绝，因为 Node 会静默地将它们压缩为 1 ms。需要为子进程启动提供额外余量的冷容器部署可以提高此值；相同的值控制着 `newSession`、工作区状态轮询和其他 ACP ext-method 截止时间。 |
| `--session-restore-timeout-ms <n>` | `60000` | ACP 会话加载/恢复的截止时间（毫秒）。必须是正整数，最大为 `2147483647`；`0` 无效。如果省略，默认为 60 秒，当显式提供的 `--initialize-timeout-ms` 值更大时，将提升至该值；较短的初始化超时时间不会降低恢复预算。SDK 和 Web Shell 分别增加 10 秒和 15 秒的客户端缓冲时间。超时返回可重试的 `504 session_restore_timeout`；这并不意味着守护进程本身已退出。 |
| `--allow-origin <pat>` | — | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。浏览器客户端的跨域允许列表。可重复使用。每个值为 `*`（任意来源——在回环绑定上启动时，若未配置 Bearer 令牌则拒绝；在非回环绑定上，生成的临时令牌满足这些保护条件，因此拒绝仅针对回环；建议在回环上使用 `--require-auth`，因为 `/health` 默认在回环上是预认证的，所以也需要 Bearer 门控；Web Shell 静态资源在所有模式下均保持预认证状态，因此传递 `--no-web` 以移除它们）或规范 URL 来源（`<scheme>://<host>[:<port>]`，无尾部斜杠 / 路径 / 用户信息 / 查询参数）。规范的 **回环** 来源可以使用 `:*` 作为端口（`<scheme>://<loopback-host>:*`，例如 `http://127.0.0.1:*`）以允许该主机在任何端口上访问；它需要 Bearer 令牌，精确匹配主机（`127.0.0.1`、`localhost` 和 `[::1]` 是不同的条目），并且被 REST CORS 匹配器和 WebSocket CSRF 门控所认可。如果没有令牌，HTTP(S) 来源在回环绑定上必须是回环地址；在非回环绑定上，生成的令牌满足相同的保护条件。远程 HTTP(S) 来源在每个 API 路由上使用 Bearer 进行身份验证；预认证例外情况仅限于 Web Shell 文档/资源路由、MCP App 沙箱、通道 Webhook 入口（使用其自身的 `x-qwen-webhook-secret` 进行身份验证），以及回环绑定上的 `/health`（在其他地方受 Bearer 门控）。浏览器扩展保留本地无令牌访问权限。有意不支持主机和子域名通配符（`https://*.example.com`）——请明确列出每个主机，或使用带有配置令牌的 `*`（以及用于完全加固的 `--require-auth`）；上述回环端口通配符是唯一的通配符形式。匹配的来源接收 CORS 响应头（`Access-Control-Allow-Origin`、`Vary: Origin`、方法、标头、max-age 和暴露的 `Retry-After`）；未匹配的来源仍会收到 403 错误，并附带与当前防火墙相同的信封格式。`Origin: null`（沙箱 iframe、file:// 文档）始终被拒绝，即使在 `*` 下也是如此。通过 `caps.features.allow_origin` 进行预检。回环自来源命中不受影响。 |
| `--web` / `--no-web` | `true` | 在守护进程根目录提供构建好的 Web Shell SPA（`GET /`、`/assets/*`、`/manifest.webmanifest`、`/sw.js` 和 `GET /session/<id>` 文档导航）。这些入口点在 Bearer 认证门控 **之前** 注册——浏览器无法向 `<script>` 子资源或地址栏导航附加令牌，且 shell 不包含任何机密。API 请求遵循守护进程的正常权限策略：配置的令牌控制正常 API 路由，除非设置了 `--require-auth`，否则回环 `/health` 除外；通道 Webhook 入口始终使用其共享密钥；无令牌的受信回环主监听器具有完整的操作员访问权限。所有其他路径的 SPA 深层链接回退位于 Bearer 中间件之后。在非回环绑定上，一行 stderr 警告指出 UI 可在无需认证的情况下访问。对于仅 API 的守护进程，请使用 `--no-web`。当构建省略 Web Shell 资源时无效（守护进程记录面包屑并以仅 API 模式运行）。 |
| `--open` | `false` | 监听器启动后，在默认浏览器中打开 Web Shell，指向守护进程 URL（当解析到令牌——无论是配置的还是生成的——时，将 `#token=` 追加为 URL 片段，因为片段永远不会发送到服务器，从而使令牌远离访问日志和 Referer 标头）。在使用 `--no-web` 时，或在没有可用浏览器的无头 / CI / SSH 环境中为空操作。 |
| `--open-with-auth` | `false` | 在回环上使用 Bearer 认证打开 Web Shell。需要启用 Web Shell 并构建资源。重用配置的令牌或生成进程生命周期的 256 位 Bearer，并在 Web Shell 片段中传递它。不符合浏览器资格的环境会打印包含机密的 URL。其他客户端需要相同显式配置的共享令牌。 |

> **内存项目范围注意事项。**
>
> - **守护进程 vs. 独立 CLI。** 标志或守护进程启动环境为该守护进程拥有的每个运行时设置一个冻结的作用域。工作区 `.env` 或 `settings.env` 不能为某个注册的工作区覆盖它。独立的 `qwen` TUI 仍然默认使用 git-root 作用域；为了保持两个入口点的一致性，请在启动它们的 shell 或服务环境中导出 `QWEN_CODE_MEMORY_PROJECT_SCOPE`。
> - **目录名冲突。** 存储键由 `sanitizeCwd` 派生，它将每个非字母数字字符替换为 `-`。仅在标点符号上有差异的同级目录（例如 `feature_1` 和 `feature-1`）即使在 `workspace` 作用域下也会映射到相同的内存目录。依赖工作区隔离时请避免此类命名。
> - **标志和环境变量的规范化不同。** 环境变量会被修剪并转换为小写（`"  Workspace  "` 有效）；CLI 标志由 yargs `choices` 区分大小写匹配（`--memory-project-scope Workspace` 被拒绝）。在两者之间复制值时请使用小写。

### 内置守护进程 Git 重定位防护

每个托管的守护进程 ACP 会话都会对模型 shell 命令应用内置的执行前守卫，独立于 `--external-tool-guard-mode` 且无需任何能力通告。守护进程拥有绑定的工作区和会话当前的有效工作目录；两者均来自可信的会话状态，绝不接受来自 ACP 子进程的值。

该守卫检查运行 shell 命令行的工具——`run_shell_command` 和 `monitor`——并在其仓库位置解析到会话的有效工作目录之外时，拒绝执行修改性的 Git 命令。对于 `git -C <path>`、`git --git-dir[=]<path>`、`git --work-tree[=]<path>` 的字面形式，前导 `GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR`/`GIT_INDEX_FILE` 赋值（包括通过 `export`/`declare`/`readonly` 进行的赋值，这些赋值会将其保留在链中每个后续命令的环境中），目录切换包装器标志（`env -C`、`sudo -D`），以及同一命令链中较早出现的 `cd`、`pushd` 或 `popd` 内置命令，均识别为位置重定向。常见的包装器前缀（`sh -c`、`bash -c`、`eval`、`sudo`、`nohup`、`timeout`、`exec`、`command`、`builtin`、`env`、路径限定的 `git` 二进制文件，以及 `{ …; }` / `! …` shell 语法）会被解包，以便相同的策略适用于内部的 Git 调用，并且 `$(…)` 或反引号替换主体会被作为独立的命令进行分析。

固定在其自身工作树中的子代理被限制在该工作树内，而不是会话的目录；如果守护进程无法确定 shell 调用的执行目录，则该调用将被拒绝。

相对目标从命令的有效起始目录（如果存在则为 `arguments.directory`，否则为会话当前的有效工作目录）进行解析，包括经过规范路径解析后的 `.git` gitfile 重定向、符号链接和每个工作树的管理目录。在执行前无法完全解析的重定位目标——动态目标（`$VAR`、反引号、`~`、通配符）、尚不存在的路径或不可读的间接引用——对于修改性或不可分类的子命令将被拒绝。无论子命令是什么，无法解析的重定位目标都会被拒绝——包括只读子命令。一旦目标解析成功，子命令属于一小部分已验证的只读集合（`rev-parse`、`cat-file`）的重定位命令仍然允许执行，除非该命令携带执行命令的 `-c` 配置，或者携带 `--output`、`--textconv` 或 `--filters` 标志：这些标志会写入文件或运行目标仓库配置的驱动程序。没有识别到重定位的命令保持其现有行为。拒绝是最终的，并作为 `Daemon shell guard denied a mutating Git command…` 报告给模型（针对已解析、动态或无法解析的仓库位置），或者当命令无法解析、其载荷无法解析或可能运行重定位 Git 命令的程序未被识别时，作为 `Daemon shell guard denied a shell command…` 报告。

该守卫对于上述字面形式的 Git 重定位是可靠的——这也是此控制措施存在的目的——但对于旨在规避它的 shell 文本而言，它是**尽力而为，而非边界**：那些向静态读取器隐藏重定位的结构可能会通过，并且新的结构将不断被发现。不要因此赋予守护进程更广泛的信任。它不解释脚本文件，不跨命令跟踪环境变量值，也不分析 heredoc 主体（heredoc 内的 Git 形状文本可能会被拒绝，即使 shell 从未执行它）。在内置守卫下，`/fork` 和由代理支持的工作区记忆 remember/dream 仍然可用；它们仅在下面的外部提供程序模式激活时受到限制。可选的外部工具守卫仍然是额外的策略，只有在内置策略允许后才会收到相同的请求。

### 必需的外部 Tool Guard

此选择性加入选项适用于需要在最终工具执行器边界处进行外部允许/拒绝决策的托管 ACP 部署。除非存在 `--external-tool-guard-mode=required`，否则该功能完全处于黑暗状态：

```sh
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

提供程序必须暴露 `POST /v1/handshake` 和 `POST /v1/prepare`，要求 `Authorization: Bearer <token>`，返回 JSON，回显提供的 nonce 或请求 ID，并使用协议版本 `1`。令牌必须非空白，最多包含 8192 个 UTF-16 代码单元，且不包含控制字符。请求限制为 1 MiB，响应限制为 64 KiB，可选的拒绝原因限制为 500 个不含控制字符的 UTF-16 代码单元。成功的 prepare 响应如下：

```json
{ "protocolVersion": 1, "requestId": "<echo>", "allowed": true }
```

拒绝使用 `allowed:false` 并可以添加简短的 `reason`。对于每个通过现有权限和 `PreToolUse` 门控并到达最终执行边界的受支持的顶层工具调用，Qwen Code 发送一个 prepare 请求且从不重试。早期的权限/hook 拒绝不会发送 prepare 请求。超时、取消、传输失败、格式错误或响应不匹配以及显式拒绝都会阻止执行器运行。每个生成的 ACP 通道还必须确认其安装了所需的回调；缺失或不兼容的确认将在创建 Session 之前拒绝该通道。提供程序请求携带 `sessionId`、`promptId`、`toolCallId`、规范的 `toolName` 和最终的 `arguments`；`toolCallId` 是一个关联标签，而不是身份验证标识或独立的幂等性键。

最终参数可能包含敏感的应用程序数据。在提供程序日志和审计存储中应如此对待它们。

`PreToolUse` hooks 在此最终执行器决策之前运行。Required Guard 模式不授权或沙箱化 hook 行为；需要围绕所有可能的副作用建立边界的部署必须禁用 hooks 或单独管理其实现。

斜杠命令操作也在模型/工具调度之前运行，且不属于 Guard 调用。某些内置命令可以直接更改文件或设置。需要全效果边界的托管部署必须拒绝斜杠命令输入，或通过 `slashCommands.disabled` 或 `--disabled-slash-commands` 禁用所有未批准的命令。

v1 托管范围限于由活动前台托管 Prompt 调用的顶层工具。当必需模式处于激活状态时，嵌套或委托的 `agent`、`workflow`、`create_sub_session`、`send_message`、直接 `/fork` 以及由代理支持的工作区记忆 remember/dream 控件均被拒绝。顶层后台 shell 或 monitor 启动仍算作一次受保护调用，其最终参数会传递给提供方，但此功能不会持续授权该进程，也不会添加进程完成审计协议；要求前台完成的策略应拒绝这些形式。受保护的 MCP 调用在传输错误后也会禁用自动重连/重放。成功启动握手后，`/capabilities` 会通告 `external_tool_guard`；若缺失，则客户端不得假定已实施强制执行。

此功能不授权显式的守护进程 REST/ACP 管理调用；这些调用继续使用守护进程的现有身份验证和路由契约。它也不会使允许的工具或 shell 命令变得确定性，或对其内部进行沙箱隔离；托管部署必须将提供方决策与正常的工具策略和隔离边界相结合。

> **调整负载旋钮大小。** `--max-sessions` 是每个工作区的新会话上限。`--max-total-sessions` 是守护进程范围的新会话上限；省略时，在默认注册容量为 256 的情况下默认为 800。其他三层也限制负载——在为高并发部署调整大小时，请一并调整它们：
>
> - **监听器级别**：`--max-connections` / `server.maxConnections=256` 限制原始 TCP 连接（慢客户端背压）。
> - **每会话订阅者**：EventBus 默认将每个会话的 SSE 订阅者数量限制为 64；第 65 个客户端会收到一个终止 `stream_error` 并被关闭。
> - **每会话 Prompt 准入**：`--max-pending-prompts-per-session=5` 限制单个会话接受的排队 + 活动 Prompt 数量。溢出时会得到带有 `Retry-After: 5` 的 `503`。
> - **守护进程范围新会话**：`--max-total-sessions=N` 限制整个守护进程范围内的新会话创建。溢出时会得到带有 `scope: "total"` 的相同 `session_limit_exceeded` 形状。
> - **每订阅者积压**：每个 SSE 客户端有一个 256 帧队列；超容量的客户端会收到一个终止 `client_evicted` 帧并被关闭（一个慢消费者无法钉住守护进程）。
>
> 这些上限相互影响：每个运行时受 `--max-sessions` 限制，而 `--max-total-sessions` 限制它们的总和。有效会话上限是任何有限的守护进程范围上限与聚合每运行时间上限中的较低者（如果每工作区上限无限，则将该聚合视为无限）。如果两者都不是有限的——这在默认注册容量下需要 `--max-total-sessions 0`——则没有有限的会话上限。有限上限 × 64 订阅者 × 256 帧是 EventBus 层的最坏情况飞行中内存；将其乘以 `--max-pending-prompts-per-session` 可限制准入层接受的 Prompt 工作量。默认大小假设单用户/小团队负载；对于更大的部署，请逐步提高（并观察 RSS）。

> **MCP client 防护栏（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** 如果在 `mcpServers` 中声明了 30 个 MCP server，workspace 将启动 30 个 client，除非你设置了上限，否则没有上游限制。`--mcp-client-budget=N` 限制活跃的 MCP client 数量；`--mcp-budget-mode={enforce,warn,off}` 选择行为模式。设置 budget 时默认为 `warn`（快照会显示警告，但不会拒绝任何 client——在开启强制执行之前，这对于测量实际扇出很有用）。在 `enforce` 模式下被拒绝的 server 会在其 per-server cell 中获得 `disabledReason: 'budget'`，并且 `budgets[0]` cell 会显示 `status: 'error'` + `errorKind: 'budget_exhausted'`。Slot 预留按 server 名称进行，并在重连/发现超时后保留——被拒绝的 server 无法从健康的 server 那里抢占 slot。
>
> **当前作用域是基于 capability 的。** 当 `mcp_workspace_pool` 存在时，一个工作区运行时中的所有会话共享其 MCP 传输池和预算控制器；`GET /workspace/mcp` 发出 `scope: 'workspace'`。第二个工作区有独立的池和预算。当该标签不存在时（包括 `QWEN_SERVE_NO_MCP_POOL=1`），守护进程使用旧版每会话 `McpClientManager` 并发出 `scope: 'session'`；在该回退中，N 个会话可以各自消耗配置的上限。
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # later, after telemetry shows your real-world distribution:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> 这与 claude-code 的 `MCP_SERVER_CONNECTION_BATCH_SIZE`（控制启动并发）**不**是一回事；它们是正交的。客户端必须基于 `mcp_workspace_pool` 进行分支，而不是仅从协议版本假设作用域。
>
> **Push events（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）。** 订阅了 `GET /session/:id/events` 的 SDK client 会在 budget 阈值被跨越时收到类型化的 frame——`mcp_budget_warning`（合成的，每次向上跨越 75% 时触发一次，并在 37.5% 时通过滞后重新武装，通过 `mcp_guardrail_events` 广播）和 `mcp_child_refused_batch`（在 `enforce` 模式下的每次发现过程中合并一次；来自 `readResource` 延迟生成拒绝的长度为 1 的 batch）。`GET /workspace/mcp` 处的快照仍然是重连后状态的 single source of truth；events 是变化边缘。在无需轮询的情况下实时构建 dashboard 时非常有用。

## 默认部署威胁模型 [#default-deployment-threat-model]

- **仅限环回** — `127.0.0.0/8`、`localhost` 或 `::1`；无需认证。
- **`localhost` 只解析一次、固定并在监听后验证** — 如果其实际监听地址不在 `127.0.0.0/8` 或 `::1` 范围内，无 token 启动会关闭监听器并失败。
- **`--hostname 0.0.0.0` 需要一个令牌** —— 当未提供任一令牌源时会生成一个；明确为空的源仍然会失败关闭。
- **`LOOPBACK_BINDS` 包含 IPv6** —— `::1` 和 `[::1]` 在无 token 规则下被视为 loopback。
- **Host header 白名单** —— 在 **loopback** 绑定上，daemon 会检查 `Host:` 是否匹配 `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` 或精确绑定的环回地址和端口（根据 RFC 7230 §5.4 不区分大小写）以防御 DNS rebinding。当监听端口 80 或 443 时，也接受相应的无端口形式，因为浏览器会省略 scheme 默认端口。这支持完整的 IPv4 环回范围（`127.0.0.0/8`）而不会接受不相关的 Host。**非 loopback 绑定（`--hostname 0.0.0.0`）故意绕过 Host 白名单** —— 运维人员已经选择了暴露面，因此 bearer-token 网关是唯一的身份验证层；反向代理 / SNI / client cert pinning 是运维人员的责任，而不是 daemon 的责任。如果你需要在非 loopback 绑定上实现基于 Host 的隔离，请在前端代理处终止 TLS 并检查 Host。
- **默认情况下，CORS 拒绝任何浏览器 Origin** — 返回 `403` JSON。传入 **`--allow-origin <pattern>`**（可重复，T2.4 #4514）以允许特定浏览器 origin 通过。每个值要么是字面量 `*`（任意 origin — 在 **loopback** 绑定上，如果未配置 bearer token，则启动被拒绝；而在非 loopback 绑定上，由于令牌生成会提供一个，因此可以启动；建议在 loopback 上使用 `--require-auth` 以实现完全加固，因为 `/health` 在 loopback 上默认仍为预认证状态 — 请注意，Web Shell 静态资源（`/`, `/assets/*`, `/manifest.webmanifest`, `/sw.js`, `/session/:id`, `/plugins`, `/channels`, `/live`, `/scheduled-tasks`, `/goals` 和 `/settings` 文档导航）在所有模式下都在 bearer 之前挂载，即使在 `--require-auth` 下也保持预认证状态，因此当剩余的浏览器表面很重要时，请使用 `--no-web`），或者是规范化的 URL origin（`<scheme>://<host>[:<port>]`，无尾部斜杠 / 路径 / userinfo）。Loopback 主机可以改用端口通配符（`<scheme>://<loopback-host>:*`）；它要求配置了 bearer token（如果没有则启动被拒绝），精确匹配 scheme 和 host（`127.0.0.1`, `localhost` 和 `[::1]` 是不同的条目），并且是除仅限 REST 的 `*` 之外唯一的通配符形式。在没有令牌的 **loopback** 绑定上，HTTP(S) 条目必须使用 loopback 主机；非 loopback 绑定始终携带一个令牌 — 无论是提供的还是生成的 — 正是因为远程托管的浏览器 origin 可以通过操作员 API 以守护进程用户身份执行代码。显式的浏览器扩展 origin 保留其无需令牌的本地自动化路径。匹配的 origin 接收正确的 CORS 响应头（`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin`，以及标准的方法 / 头部 / max-age 和暴露的 `Retry-After`）；不匹配的 origin 仍然收到 403，并带有与默认墙相同的信封。`caps.features.allow_origin` 有条件地通告，以便 SDK / webui 客户端可以在发出跨源请求之前预检守护进程是否尊重它们。示例：`qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`。Loopback 同源命中（例如 Web Shell UI）不受影响 — 无论 `--allow-origin` 如何，都有一个单独的 Origin-strip shim 处理它们。内置远程 Web Shell 的同源 **HTTP** 请求也可以在不需要 `--allow-origin` 的情况下工作：在非 loopback 主监听器上，等于直接 socket scheme 加上规范化 `Host` authority 的 `Origin` 经过 bearer 认证后，在 CORS 墙之前被剥离，而其现有的公共静态路由保持未认证状态。两个排除项仍然需要 `--allow-origin` — 转发头从不建立同源信任，因此 TLS 终止反向代理的 `https` 浏览器 origin 不是同源的（重写 `Host` 头的纯 HTTP 中间件也不是，例如 nginx 的默认 `proxy_set_header Host $proxy_host` 或 k8s Ingress；那里的补救措施是为你的浏览器看到的 origin 设置 `--allow-origin <origin>`，或者使用逐字转发 `Host` 的代理 — 仅端口转换不需要任何东西，因为只比较转发的 `Host`，仅剥离 scheme 默认的 `:80`/`:443`），并且 WebSocket 升级路由（终端、语音）保持一个单独的 CSWSH 门控，仅允许同端口的 loopback origins、明确列入白名单的 origins（包括 loopback 端口通配符）以及 Local Control 监听器自身的 origin；`*` 字面量在那里不适用。
- **Chrome 扩展浏览器自动化与 framing 是分开的。** `qwen serve --allow-origin chrome-extension://<id>` 允许扩展 frame Web Shell 并连接到守护进程。Console/network/screenshot/click 工具需要外部 CDP MCP 适配器命令：`QWEN_CDP_MCP_COMMAND=/path/to/cdp-mcp-adapter qwen serve --allow-origin chrome-extension://<id>`。主 CLI 包不包含浏览器自动化适配器；客户端可以在展示这些工具为可用之前检查 `caps.features.includes('browser_automation_mcp')`。
- **生成的 `qwen --acp` 子进程接收其所属运行时的有效环境。** 守护进程冻结一个 process-env 基础，将该工作区的 settings/env-file 覆盖应用到运行时本地快照，且永远不会将覆盖写回 `process.env`；另一个运行时中同名的键不会跨越。`QWEN_SERVER_TOKEN` 在生成前被清除，因为 agent 不需要守护进程 bearer。影响加载器的变量（`NODE_OPTIONS`、`npm_config_node_options` 和 npm 的配置文件重定向、`NODE_PATH`、`OPENSSL_CONF`、`NODE_REPL_EXTERNAL_MODULE`、`npm_config_node_gyp`、`npm_config_init_module`、`LD_PRELOAD`、`LD_AUDIT`、`DYLD_INSERT_LIBRARIES`、`BASH_ENV`、`ZDOTDIR`、导出的 bash 函数定义 `BASH_FUNC_*`）同样永远不会传递给会话子进程 — 守护进程从自己的 `process.env` 和会话托管子进程生成的冻结基础环境中清除它们（基础环境仅在 `DEV=true` 工具链下保留它们，其 `.ts` 入口仍需要 tsx 加载器），且 `.env` / `settings.json` `env` 源拒绝它们（参见 [settings](./configuration/settings.md)）；这适用于守护进程托管的每个会话。基础凭据如 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`QWEN_*` 和 `DASHSCOPE_API_KEY` 否则直接传递，除非运行时覆盖更改它们。**这是有意的，不是沙箱。** agent 以相同的 UID 运行并具有 shell 工具访问权限，因此 `~/.bashrc`、`~/.aws/credentials` 或 `~/.npmrc` 中的任何内容无论如何都可以通过 prompt 注入到达。运行时之间的环境隔离不是操作系统安全边界；不要在拥有你不会信任 agent 的凭据的身份下运行 `qwen serve`。
- **Agent 文本读取是子进程本地的，遵循常规 CLI 权限规则，而不是工作区文件系统边界。** 直接的 `read_file` 可以到达所有已注册工作区之外的主机文本路径：外部路径默认为确认，允许规则或审批模式可能会自动批准它们。批准的读取使用可配置的 CLI 输出限制，而不是工作区文件系统的返回输出、完整快照和大文本扫描上限。这适用于每个共享文本读取消费者，因此 write、edit、notebook、sed 和 artifact 操作执行的预读取会失去这些上限以及工作区文件系统的读取审计、符号链接拒绝和读取端 TOCTOU 保护 — 确切列表请参阅[设计文档](../design/daemon-local-text-reads.md)。由于确认有效负载是通过读取文件构建的，工作区外的 diff 会在任何人批准之前分发给**每个**附加的 SSE 订阅者 — 在交互式 CLI 中，该内容仅由终端前的人看到。将已认证的守护进程客户端视为相同的安全主体。HTTP 文件系统路由仍保持工作区作用域，agent 发现工具行为不变。
- **来自内置文本工具的已批准最终写入具有狭窄的同主机路由。** `write_file`, `edit`, `notebook_edit` 以及 shell 工具的模拟 sed 编辑器仅在现有权限策略允许执行后才附加内部来源信息。因此，它们的最终 ACP 文本写入可以针对拥有工作区之外的绝对路径而无需第二次确认；allow 规则、AUTO/AUTO_EDIT 和 YOLO 的行为类似于 CLI，而拒绝、Plan、Hook/Guard 拒绝和执行前取消不会发送最终写入。在工具已经进入不可取消的文件系统操作后的取消保持该工具的现有行为。工作区目标仍使用 WFS。外部目标使用具有相同信任快照、5 MiB 编码限制、叶符号链接拒绝、规范路径锁、原子重命名、模式保留、默认 `0600` 新文件模式（可配置 — 参见 [Agent 文本写入的新文件模式](#new-file-mode-for-agent-text-writes)）、生成守卫和文件系统审计的守护进程主机写入器。HTTP 写入、通用或未标记的 ACP 写入、注入的 bridge/workspace-registry/factory 集成和任意 shell 重定向不会收到此例外。参见 [外部写入设计](../design/daemon-external-tool-text-writes.md)。
- **每个订阅者有界的 SSE 队列** — 溢出队列的慢速客户端会收到 `client_evicted` 终止帧并被关闭；一个卡住的消费者无法拖累守护进程。
- **每会话 prompt 准入上限** — 默认为每个会话 5 个已接受但未处理的 prompt。有缺陷的客户端无法为一个会话排队无限制的 prompt promise 或临时 SSE 等待。
- **优雅关闭** — SIGINT/SIGTERM 在关闭监听器之前 drain agent 子进程（每个子进程 10 秒截止时间）。

> ⚠️ **权限投票现在是会话范围的 — 外加一个标准的共享 bearer 注意事项。** 优先使用 `POST /session/:id/permission/:requestId`（Wave 4 / F3）：它将请求路由到拥有命名活动会话的运行时，并且永远不会回退到主 bridge — 新的多工作区集成应始终使用此路由（预检 `caps.features.session_permission_vote`）。遗留的进程全局 `POST /permission/:requestId` 为 pre-F3 单工作区客户端保留：它是主绑定的，并且对于由另一个注册运行时拥有的会话会 `404` — 与默认 `first-responder` 策略下丢失的投票具有相同的主体 — 因此那里的 `404` 本身并不意味着请求已经被回答。路由表：[daemon REST API 参考](../developers/daemon-rest-api-reference.md#permissions)。标准注意事项：每个持有 bearer token 的客户端都是相同的安全主体 — 不要在共享给不受信任方的 bearer 后面运行 `qwen serve`。
>
> ⚠️ **Stage 1 已知缺口 — `POST /session/:id/prompt` 正文上限为 10 MB (BUy4L)。** 包含超过 10 MB 的图像 / PDF / 音频的多模态提示将在路由逻辑运行之前的正文解析阶段失败（无流式传输，无上传中止）。解决方法：在客户端缩小内容，或传递路径引用并让 agent 通过 `readTextFile` 读取文件。Stage 1.5 将在 `/prompt` 上接受 `multipart/form-data` 或分块编码，以便大型提示不会遇到悬崖。
>
> ⚠️ **阶段 1 已知缺口——NAT 后的幻影 SSE 连接。** 守护进程通过心跳上的 TCP 背压检测死客户端（15 秒间隔）。一个在没有 TCP RST 的情况下消失的客户端（例如静默丢弃空闲流的 NAT 盒）会使内核级套接字保持“存活”，直到 Node 的 keepalive 探测超时——通常在 Linux 默认设置下约为 2 小时。在此类 NAT 后的 `--hostname 0.0.0.0` 部署中，幻影 SSE 连接可能会累积并最终达到 256 `server.maxConnections` 上限。
>
> 设置 [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout)（问题 [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9）以通过显式的应用程序级空闲截止时间来弥补这一缺口：当没有写入成功刷新超过 `n` 毫秒时，守护进程会发出一个带有 `reason: 'writer_idle_timeout'` 的终止 `client_evicted` 帧并关闭流。该标志默认关闭以保持遗留契约——在吞没 RST 的网络上的操作员应选择远高于 15 秒心跳间隔的值（例如 `60000`–`300000`），以便在及时回收真正卡住的写入器的同时，不会驱逐合法的闲置连接。从你的 SDK 预检 `caps.features.includes('writer_idle_timeout')` 以确认守护进程支持它。

### 截止期限与写入者空闲超时 [#deadlines-and-writer-idle-timeout]

Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 提供了两个可选标志，弥补 15 秒心跳 + AbortSignal 未覆盖的长时间运行/远程部署差距。共享的权限响应超时也在此处列出。三者均默认关闭。

| 标志                           | 环境变量                             | 默认值 | 功能                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>` | `QWEN_SERVE_PROMPT_DEADLINE_MS` | 未设置 | 服务器端对单个 `POST /session/:id/prompt` 的挂钟时间上限。到期时，守护进程中止提示词的 AbortController 并返回 HTTP `504` 及 `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`。每个提示词请求体字段 `deadlineMs` 可以缩短有效截止时间至低于标志值，但绝不能延长它。能力标签（条件性）：`prompt_absolute_deadline`。 |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | 未设置 | 每个 SSE 连接的闲置截止时间。当没有写入成功刷新超过 `n` ms——既不是真实事件也不是 15s 心跳——守护进程发出带有 `data.reason = 'writer_idle_timeout'` 的终止 `client_evicted` 帧（镜像于 `data.errorKind`）并关闭流。**选择一个明显高于 15s 心跳的值**（例如 `30000`–`300000`），以免合法的闲置流被驱逐；值 `< 15000` 将在第一次心跳触发前驱逐原本健康的闲置连接（仅用于测试/短期开发会话）。能力标签（条件性）：`writer_idle_timeout`。 |
| `--permission-response-timeout-ms <n>` | —                                   | `0`     | 守护进程模式下普通权限和 `ask_user_question` 响应的共享挂钟时间。`0` 或省略该标志会无限等待；正整数对两者都施加截止时间。投票者取消、会话取消和守护进程关闭仍然会在计时器禁用时解析待处理的交互。                                                                                                                                                                                                                                                                                                            |

prompt 和 writer 标志都接受毫秒为单位的正整数；`0`、`NaN`、非整数或负值在启动时被拒绝，并带有清晰的错误消息。权限响应超时接受 `0` 或正整数。对于两个环境支持的截止时间，显式 `ServeOptions` 字段优先于环境变量。SDK 消费者应在依赖 prompt 和 writer 行为之前预检匹配的 capability 标签。

### Agent 文本写入的新文件权限模式 [#new-file-mode-for-agent-text-writes]

Agent 文本写入（`write_file`、`edit`、`notebook_edit` 以及 shell 工具的模拟 sed 编辑器）通过守护进程的原子写入器发布，它会保留现有目标的权限模式，而对于**新**文件，默认使用仅限所有者的 `0600`，忽略守护进程进程的 umask。这种 fail closed 的默认值是有意为之的：无论主管 umask 多么宽松，新创建的 agent 文件都不会意外地对组/其他用户可读。

部署约定基于 umask 的运维人员（例如带有 `UMask=0002` 的 systemd 单元、共享组仓库）可以通过以下方式让新文件使用标准 POSIX 处理：

| 环境变量                   | 值                | 默认值  | 功能                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ----------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_NEW_FILE_MODE` | `owner` \| `system` | `owner` | `system` 以 `0o666 & ~umask` 创建新文件，因此 agent 创建的文件会像机器上的其他进程一样跟随守护进程进程的 umask。`owner` 保持不受 umask 影响的 `0600` 默认值。值不区分大小写；字面值 `0600` 作为 `owner` 的别名被接受（不支持其他八进制模式），任何其他值都会被拒绝，并在 stderr 输出警告后保持 `0600` 默认值。 |

范围和限制：

- 适用于文本写入路由创建的新文件（工作区目标、同主机外部宿主写入器和 HTTP 文本写入）。现有文件始终保留其磁盘上的权限模式 — 编辑 `0600` 的密钥文件仍保持 `0600`，可执行文件保持 `+x`。
- 二进制上传（`POST /file/upload`）无论此设置如何，始终以 `0600` 创建。
- 守护进程在工作区文件系统构建时读取该变量；更改后请重启守护进程。

### 对话工作目录 [#conversations-working-directory]

独立于操作系统主目录设置独立和 Live 会话的工作目录根路径：

```bash
qwen serve --conversations-dir /persistent/qwen-conversations

# Or configure the launch environment:
QWEN_CONVERSATIONS_DIR=/persistent/qwen-conversations qwen serve

# The same option is available for a detached daemon:
qwen daemon start --conversations-dir /persistent/qwen-conversations
```

显式标志优先于 `QWEN_CONVERSATIONS_DIR`，后者可能来自启动环境或用户级 `.env` 文件。嵌入式启动器可以通过 `ServeOptions.conversationsDir` 选择相同的根路径，这也优先于环境变量。当两者均未配置时，根路径保持为 `~/Documents/Qwen Code/Conversations`。在该默认路径挂载持久卷或更改进程主目录也是有效的部署选择。

显式值必须是非空、完全限定的绝对路径，且不含 NUL 字符。相对路径、未展开的 `~` 以及依赖当前驱动器的 Windows 路径将被拒绝。值不会被修剪，无效配置会导致启动失败而不是回退。有效的显式标志或 API 选项会覆盖无效的环境变量值。路径语法在监听之前检查；目录创建和文件系统检查保持惰性，因此未使用的对话根路径不会在启动时创建。首次使用时的文件系统故障不会选择另一个根路径。

该选择在守护进程的整个生命周期内固定。项目 `.env` 和项目 `.qwen/.env` 文件、所有作用域下的顶层 `settings.json` `env`、环境重载以及浏览器/会话请求都无法重定向它。没有对应的项目设置或每会话根路径选项。

独立和 Live 继续共享现有的对话运行时。每个会话使用其确定性的私有 `conversation-<sha256(normalized session ID)>` 直接子目录作为工具和 Shell 的工作目录。现有的所有权、私有 POSIX 权限、规范标识、直接子目录、链接/重解析点、写入租约和恢复检查仍然适用，包括其平台特定的限制。Windows 不会获得 POSIX 所有者/模式或 ACL 保证，并且无法验证 inode 标识的文件系统仍然无法检测每次同路径替换。选定的对话树仍保留不用于普通工作区注册；其他工作区保留其现有规则。

工作根路径和运行时存储具有不同的职责：

| 数据 | 位置 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 会话工作文件 | 选定对话根路径下的私有会话子目录。 |
| 共享根配置 | 选定根路径下由用户编写的配置，在其会话间共享。 |
| 转录文件和辅助文件 | 现有的守护进程运行时基础存储，以规范的对话运行时 cwd 为键。 |
| 删除恢复日志 | 稳定的 `<home>/.qwen/conversations/deletions` 命名空间。 |
| Live 发现 | 稳定的 `<home>/.qwen/live/daemon.json` 定位器，以及在适用情况下的守护进程运行时基础副本。 |
| 本地守护进程发现 | 守护进程运行时基础下的 `daemon/daemon-<port>.json`；记录选定的对话路径以供重启。 |

`QWEN_HOME` 选择全局 Qwen 配置目录。`QWEN_RUNTIME_DIR` 和 `advanced.runtimeOutputDir` 通过其现有的优先级规则选择运行时输出存储。没有一个选择对话工作目录根路径。仅持久化运行时存储不会持久化在私有会话目录中创建的文件；仅配置工作根路径也不会保留运行时存储或基于主目录的恢复和发现状态。

对于使用相同根路径的重启，请保留相同的规范路径、运行时基础和所需控制状态。`qwen daemon restart` 从当前发现记录中保留根路径，自动更新重启也会保留选定的根路径。正常的文件系统标识接受、权限、写入租约和恢复检查仍然运行；这并不保证在每次容器或主机重启后都能恢复。参见 [对话写入锁和恢复](./conversations-recovery.md)。

要有意更改根路径，请针对原始根路径完成待处理的删除恢复，停止所有使用该路径的写入者，然后使用新配置停止并启动守护进程。不同的规范根路径会选择不同的历史存储/发现命名空间和共享根配置。工作文件、会话记录、配置、恢复日志或发现状态都不会自动迁移，旧的历史记录也不保证保持可见。不要移除恢复证据以强制接受：如果针对原始根路径的恢复无法完成，更改此选项并非修复程序。

### 会话附件存储 [#session-attachment-storage]

会话附件（Web Shell 通过 `POST /session/:id/attachments` 上传的文件和图片）默认存储在工作区的运行时临时目录下：`<runtimeBaseDir>/tmp/<projectHash>/attachments`，按会话键控为 `session-<sessionId>`。希望附件持久化到运行时临时目录之外（例如专用卷）的运维人员可以覆盖根目录：

| 环境变量                              | 值   | 默认值 | 功能                                                                                                                                                                                                |
| ------------------------------------- | ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_SESSION_ATTACHMENTS_ROOT` | 路径   | 未设置   | 将会话附件存储在此目录下，而不是默认的运行时临时目录。接受绝对路径、相对于守护进程 cwd 的路径，或针对主目录展开的 `~` / `~/…`。 |

范围和限制：

- **单向迁移。** 设置环境变量后，新附件仅写入配置的根目录下。未命中配置根目录的读取和删除会回退到默认的运行时临时目录，因此在切换**之前**上传的附件仍然可读，并且在默认回退目录可写时仍可删除 — 如果无法 unlink 旧副本（例如只读的回退卷），则会暴露错误而不是报告成功。反向操作 — 在附件已写入配置根目录后移除环境变量 — 会使这些附件无法访问；对于给定工作区，请保持该变量稳定。
- **每会话布局。** 文件在两个位置中都位于 `<root>/<projectHash>/attachments/session-<sessionId>/` 下，其中 `<projectHash>` 是默认运行时临时目录使用的相同工作区哈希；回退查找使用默认目录中的相同会话布局。指向同一配置根目录的两个工作区彼此保持隔离。
- **删除清理。** 删除会话时，其附件目录会从配置的根目录和默认回退目录中同时移除。归档会话会保留其附件，以便在取消归档后仍然存在。
- 守护进程在启动时读取该变量；更改后请重启守护进程。该目录必须可被守护进程进程写入。

## 多会话与多工作区部署 [#multi-session--multi-workspace-deployment]

重复 `--workspace` 可在一个 `qwen serve` 进程中注册多个不重叠的工作区。第一个路径为主工作区。每个已注册的工作区拥有一个隔离的运行时边界，而守护进程级的监听器、身份验证策略和总会话上限是共享的。生产模式会尝试预热主 ACP 子进程以兼容并在失败后于首次使用时重试；受信任的次要工作区按需启动自己的子进程，而不受信任的次要工作区不会启动 ACP。请求可以通过规范的 `cwd` 选择已注册的工作区；省略 `cwd` 的请求使用主工作区。每个用户或安全主体使用一个守护进程；工作区信任是执行门控，不是 ACL。

不受信任的次要工作区在 Web Shell 中显示为 `untrusted` 和 `read-only`。它可以展开以查看持久化会话目录，但目前无法在 Web Shell 中选择或打开、恢复、用于创建会话或完整导出。REST API 遵循现有的有界文件系统读取策略，还暴露其持久化会话组目录，以及当 `workspace_persisted_transcript` 被公布时，通过有界的工作区限定分页器暴露其活跃持久化转录。前进和游标读取不会启动 ACP 子进程；活跃会话的向后首页可能会启动一个以刷新持久化尾部。完整的工作区限定导出需要受信任的工作区和单独的 `workspace_session_export` capability。在使用执行、变更或导出功能之前，请先信任该工作区并重启守护进程。不受信任的主工作区在 Web Shell 中保持禁用状态。

当你需要更小的故障或安全边界、独立的 bearer token、配额、审计边界、操作系统隔离或独立的资源监督时，请使用独立的守护进程。多工作区模式适用于一个运维人员托管多个仓库；它不是多租户隔离边界。单个守护进程 token 授权守护进程暴露的每个路由，包括所有已注册工作区的允许只读目录。

> **在附加时先订阅再发布 `modelServiceId`。** 当客户端 `POST /session` 带有 `modelServiceId` 且工作区已有一个运行不同模型的会话时，守护进程发起内部 `setSessionModel` 调用——失败不会作为 HTTP 错误传播（会话保持在其当前模型上运行）。可见的失败信号是会话 SSE 流上的 `model_switch_failed` 事件。如果你调用 `POST /session` 然后才打开 `GET /session/:id/events`，你将错过失败事件并静默地继续与错误的模型对话。请先打开 SSE 流，或在订阅时传递 `Last-Event-ID: 0` 以重放环形缓冲区中最旧的可用事件。

要处理多个**用户或安全主体**（每个都有独立的 token、配额、审计日志、沙箱或进程故障边界），或者要扩展超出单个进程的范围（冷启动预算、FD 数量、RSS），请在外部编排器后面为每个主体生成一个守护进程。每个这样的守护进程仍然可以为该主体托管多个工作区。编排器（多租户 / OIDC / 配额 / 审计 / k8s）**不在** qwen-code 项目的范围内 — 请参阅 issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" 获取设计指引。

## 加载和恢复持久化会话 [#loading-and-resuming-a-persisted-session]

守护进程通过 HTTP 暴露 ACP 的 `session/load` 和恢复流程，以及一个独立的只读转录分页器：

| 路由                                                    | 使用时机                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /session/:id/load`                                | 客户端**没有**有用的本地历史渲染（冷重连、先选择再打开）。对于活跃会话，守护进程返回并注入当前的有界重放快照窗口；如果较旧的重放已被丢弃，快照以 `history_truncated` 开头。Capability 标签：`session_load`。                                                                                       |
| `POST /session/:id/resume`                              | 客户端已经在屏幕上显示了 turn，只需要守护进程端的句柄。模型上下文在代理端恢复，无需 UI 重放 — SSE 流保持干净。Capability 标签：`session_resume`（`unstable_session_resume` 仍然是旧版客户端的弃用别名）。                                                                                             |
| `GET /session/:id/transcript`                           | 客户端需要完整的活跃持久化转录。它以游标分页返回无 id 的重放帧，不调用 `/load`、不附加客户端、不植入实时 EventBus、不创建活跃会话，也不更改实时重放窗口。Capability 标签：`session_transcript`。                                                                                                   |
| `GET /workspaces/:workspace/session/:id/transcript`     | 客户端需要从选定工作区获取活跃持久化转录。前进和游标页面保持在守护进程本地；活跃会话的向后首页可能会启动 ACP 并加载工作区设置以刷新持久化尾部。已注册的不受信任次要工作区可以使用此只读路径。Capability 标签：`workspace_persisted_transcript`。                                                                                                                          |
| `GET /workspaces/:workspace/session/:id/export`         | 客户端需要从选定的受信任工作区获取完整的 `html`、`md`、`json` 或 `jsonl` 附件。它读取活跃持久化存储而不启动 ACP 或回退到主工作区。Capability 标签：`workspace_session_export`。                                                                                                                     |
| `GET /workspaces/:workspace/session/:id/archive/export` | 客户端需要从选定的受信任工作区中已归档的持久化存储获取相同的附件格式。它不会取消归档、启动 ACP 或回退到活跃或主会话。Capability 标签：`workspace_archived_session_export`。                                                                                                                          |

对于负载和恢复，TypeScript SDK 在 `DaemonSessionClient` 上暴露了静态工厂：

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Cold reconnect — daemon will replay the bounded snapshot window through SSE.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Or, if your UI already has the history, skip the replay:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // First the replayed `session_update` frames (load only),
  // then live events.
}
```

在调用匹配的路由之前预检 `caps.features.session_load`、`caps.features.session_resume` 或 `caps.features.session_transcript` —— 较旧的守护进程会返回 `404`。`unstable_session_resume` 仍作为已弃用的兼容性别名进行通告。针对同一 id 的并发相同操作请求会被合并；跨操作竞争（例如 `load` 与 `resume` 竞争）以及调用方提供 id 的生成与恢复之间的竞争将得到 `409 restore_in_progress` 并附带 `Retry-After: 5`。超过 `limits.sessionRestoreTimeoutMs` 的恢复操作会得到可重试的 `504 session_restore_timeout` 并附带预算推导出的 `Retry-After`（限制在 5-120 秒之间）；仍在运行的子请求将被隔离直到清理完成，在此期间对同一 id 的重试将得到 `409 restore_in_progress` 并附带 `reason: awaiting_abandoned_cleanup` 和预算推导出的 `Retry-After`（限制在 5-120 秒），而不是固定的 5 秒延迟。如果清理状态不确定，或者被放弃的恢复在其截止时间后仍未在一个完整的恢复预算内完成，新的会话工作将暂时得到 `503 acp_channel_unavailable` 并附带 `reason: restore_cleanup_failed` 或 `restore_settlement_overdue`。超时但未及时完成的会话初始化同样可能返回 `reason: new_session_cleanup_failed`（当延迟清理结果不明确时）或 `new_session_settlement_overdue`（当子请求在另一个初始化预算期间仍未解决时）。由于上述所有四个原因，已活跃的会话仍然可用。有关完整的错误信封，请参阅 [协议参考](../developers/qwen-serve-protocol.md)。

对于完整的持久化重放，请使用 `DaemonClient.getSessionTranscriptPage(sessionId, { cursor, limit })` 或原始 REST 路由进行分页：

```bash
curl "http://127.0.0.1:4170/session/$SESSION_ID/transcript?limit=100"
```

对于已注册的工作区，请使用 `client.workspaceById(workspaceId).getSessionTranscriptPage(sessionId, { cursor, limit })` 或 `/workspaces/:workspace/session/:id/transcript`。工作区限定方法始终使用原生 REST，即使 SDK 客户端有可替换的 ACP 传输。其游标仅限守护进程生命周期，守护进程重启后必须从第一页重新开始。活跃会话的向后首页可能会启动 ACP 并加载工作区设置以在读取前刷新持久化尾部。

对于来自受信任已注册工作区的完整附件，请预检 `workspace_session_export` 并调用 `client.workspaceById(workspaceId).exportSession(sessionId, { format: 'html' })` 或原始 `/workspaces/:workspace/session/:id/export` 路由。不要从 `session_export` 或 `workspace_qualified_rest_core` 推断支持：旧版守护进程可能同时公布两者但仍保留仅主工作区导出。当前的 Web Shell 导出操作仍然是仅主工作区的；请使用 SDK 或 REST 路由来导出其他工作区。

对于已归档的附件，请预检 `workspace_archived_session_export` 并调用 `client.workspaceById(workspaceId).exportArchivedSession(sessionId, { format: 'html' })` 或 `/workspaces/:workspace/session/:id/archive/export`。此路径就地读取已归档的存储，对于仅活跃的 id 返回 `409 session_not_archived`；它不会取消归档会话。当 capability 存在时，Web Shell 为受信任的主工作区和次要工作区中的已归档行暴露相同的导出。

`limit` 是活跃聊天记录的目标数量，而非发出的重放帧数；一条记录可以产生多个 `session_update` 事件。向后分页最多可扩展至 `3 * limit` 条记录，以保留轮次和工具调用/结果的边界。第一个响应冻结 JSONL 快照大小，并在 `hasMore` 为 true 时返回 `nextCursor`。后续页面忽略第 1 页之后的追加内容，但如果文件被删除、截断、替换、归档或以其他方式与冻结的光标冲突，则返回 `409`。非常大的快照会在索引之前返回 `413 transcript_too_large`，以防止守护进程在请求路径上扫描无限制的转录文件。

对于通过遗留单数路由进行的重复分页，请将 `--channel-idle-timeout-ms` 设置为正值。使用默认的 `0` 时，空闲工作区的 ACP 子进程——及其持有的进程内转录索引缓存——会在每一页后被回收，因此每一页都会重新生成子进程并通过重新扫描整个冻结前缀来重建索引（每页 `O(snapshotSize)`）。正的超时时间使子进程在光标遍历期间保持存活，从而复用其缓存的转录索引和重放配置，除非 `--child-heap-mode admit` 或 `enforce` 为了在其他工作区中满足容量受限的生成而回收它。在这种情况下，下一页将重新生成子进程并重建索引。限定工作区的前向和光标分页保持在守护进程本地；只有活跃会话的向后第一页会跨越刷新屏障。

注意：活跃会话历史重放受到两次限制：SSE 环形缓冲区用于 `Last-Event-ID` 重连，以及 `POST /session/:id/load` 返回的快照受 `--compacted-replay-max-bytes` 限制。包含冗长轮次的长历史可能会超出任一限制。守护进程通过 `history_truncated` 显示快照截断；当你需要完整的活跃持久化历史时，请使用 `/transcript`。

## 持久化模型 [#durability-model]

**活跃会话会被守护进程重启中断，但持久化会话仍保留在磁盘上并可重新加载：**

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
6. **`client_evicted` 之前的 `slow_client_warning` 事件** — 软背压，以便行为良好的慢速客户端在被终止前可以自我节流（修剪渲染深度、丢弃块）。

**集成人体工程学：**

7. **`POST /session/:id/_meta` 用于 IM 风格的上下文** —— 附加到后续 prompt 的每会话键值对（聊天 id、发送者、线程 id），取代每通道的临时方案。
8. **`/capabilities` 实际特性协商** —— `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }`，以便客户端能够检测到偏差，而不是直接回退到"未知帧，忽略"。
9. **一等公民的持久化文档**（本节） —— 已在上方发布。

完整的融合路线图在 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) 中跟踪。

## 第一阶段范围边界 —— 我们在阶段 1.5 中不会修复的问题 [#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15]

有两个结构性选择被明确列为阶段 1 / 1.5 / 2 主线路线图的非目标。如果你的用例依赖于其中任何一个，请围绕它们进行规划，而不是等待我们。

### 会话状态仅限本地修改（根据 [LaZzyMan review #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721)）

阶段 1.5 计划将 TUI 描述为进程内 EventBus 订阅者。实际上，**TUI UI 严格大于线路协议（wire protocol）**：

- **仅限本地的 UI** —— 约 15 个 Ink 对话框组件（`ModelDialog`、`MemoryDialog`、`PermissionsDialog`、`SessionPicker`、`WelcomeBackDialog`、`FolderTrustDialog` 等）以及 `local-jsx` 斜杠命令（`/ide`、`/auth`、`/init`、`/resume`、`/rename`、`/delete`、`/language`、`/arena` 等）渲染特定于终端的 Ink JSX。通过 HTTP/SSE 连接的远程客户端无法等效渲染 Ink，且这些流程不会发出线路事件。
- **没有线路事件的会话状态修改** —— `/approval-mode`、`/memory add`、`/mcp add-server`、`/agents`、`/tools enable/disable`、`/auth`、`/init`（写入 `CLAUDE.md`）都会改变代理行为，但目前只有 `/model` 会发布事件（`model_switched`）。

**阶段 1 的选择 —— 评审中的选项 (A)**：不将这些修改提升为线路事件。这两种部署模式会产生不同的后果。

#### 模式 1 —— 无头 `qwen serve`（本 PR）

守护进程内部没有运行 TUI shell。上述列出的斜杠命令在此模式下**不存在** —— 因为没有终端 UI 来发出它们。因此，会话状态是：

- **启动时冻结** 的 `approval-mode` / `memory` / `agents` / `tools` 允许列表 / `auth` —— 当守护进程的 `qwen --acp` 子进程启动时，全部从设置和磁盘加载；在会话生命周期内不可变。设置中定义的 MCP 服务器同样在启动时冻结，但**运行时添加的服务器**（通过 `POST /workspace/mcp/servers`）可以在不重启的情况下添加或删除。
- **通过 HTTP 可变** via `POST /session/:id/model` (发布 `model_switched`), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name` (发布 `mcp_server_added` / `mcp_server_removed`), 以及权限投票 (`POST /session/:id/permission/:requestId`; 遗留的进程全局 `POST /permission/:requestId` 仍保留给 pre-F3 单工作区客户端).

**后果：** 无头模式下的远程客户端可以看到**完整的会话状态**。没有 TUI 隐藏额外状态；不可能出现状态漂移。如果你想更改 `approval-mode`，请使用新设置重启守护进程。MCP 服务器现在可以通过修改路由（`POST /workspace/mcp/servers`、`DELETE /workspace/mcp/servers/:name`）在运行时添加/删除 —— 请参阅[运行时 MCP 服务器管理](#runtime-mcp-server-management-issue-4514)。

#### 模式 2 —— 阶段 1.5 `qwen --serve` 协同托管 TUI（不在本 PR 中）

当阶段 1.5 落地 `qwen --serve`（TUI 进程协同托管同一个 HTTP 服务器）时，TUI **确实**与远程客户端并存。本地操作员输入 `/approval-mode yolo` 或 `/mcp add-server` 会修改会话状态，而 HTTP 上的远程客户端没有事件可以观察到此更改。

在此模式下，TUI 是一个 **"超级客户端"** —— 它观察远程客户端看到的相同代理对话，并且可以修改远程客户端无法修改的会话状态。这种不对称性体现在：

- ✅ TUI 和远程客户端都能看到相同的代理消息、工具调用、文件差异和权限提示。
- ❌ 只有 TUI 能看到/修改 approval-mode / memory / MCP 服务器列表 / agents / tools 允许列表 / auth 状态。

**模式 2 中的后果：** 如果远程客户端 UI 尝试镜像会话设置，在任何 TUI 斜杠命令后都可能发生漂移。远程客户端应 **在附加/重连时重新获取状态**（使用 `Last-Event-ID: 0` 重放环形缓冲区中最旧的事件，例如 `model_switched`）；它们不应依赖增量事件来处理 TUI 端的变更。

#### 为什么选择 (A) 而不是 (B)（将修改提升为 `session_state_changed` 事件族）

(B) 是更具野心的答案，但会将阶段 1.5 锁定在一个大得多的线路表面上，且该表面还必须干净地通过计划中的进程内重构。我们宁愿诚实地走较小的范围。会话状态事件分类工作 —— 列举哪些 TUI 流程在设计上仅限本地，哪些可以在未来选择加入的 (B) 风格扩展中合理地升级为线路事件 —— 将移至 [#3803](https://github.com/QwenLM/qwen-code/issues/3803)，而不是阶段 1.5 代码中。

### 每个工作区运行时 N 个并行会话共享一个 `qwen --acp` 子进程

同一可信工作区上的多个会话通过代理的原生多会话支持 (`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`) **共享该运行时的 `qwen --acp` 子进程**。桥接器为每个会话调用 `connection.newSession({cwd, mcpServers})` —— 代理将它们存储在其会话映射中并按调用的 sessionId 进行解复用。生产环境最多可以拥有一个主子进程（默认尝试预热）加上每个可信次要工作区一个按需子进程；不可信次要工作区不拥有任何子进程。

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

**对等代理（Cursor / Continue / Claude Code / OpenCode / Gemini CLI）都执行单进程多会话。** qwen-code 在代理层与它们保持一致；此 PR 中的 Stage 1 桥接器使相同的架构通过 HTTP 可见。

## 登录到远程守护进程（问题 #4175 PR 21）

当守护进程在远程 Pod 上运行（与你没有共享显示）时，客户端可以通过 HTTP 触发 OAuth 设备流程。守护进程自己轮询 IdP；你的工作只是在任何具有浏览器的设备上打开一个 URL。

新接入请使用 [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)，并开通 Plus 或 Pro 订阅。购买订阅和浏览器授权时使用同一个 Qwen 账户。

1. 调用 `POST /auth/subscription/flows?paywallScene=cli` 发起登录，保存响应中的 `id`。
2. 轮询 `GET /auth/subscription/flows/:id`。返回 `authorizationUrl` 后，在浏览器中打开该地址并完成登录。
3. 流程进入 `ready` 后，调用 `POST /workspaces/:workspace/auth/subscription`，为需要使用订阅的工作区激活。

> [!note]
>
> Qwen OAuth 免费额度已于 2026-04-15 停止提供。下方的 `qwen-oauth` 示例供查阅旧版设备授权协议。

```bash
# 1. Start a flow. The daemon contacts the IdP, returns a code + URL.
curl -X POST http://127.0.0.1:4170/workspace/auth/device-flow \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId":"qwen-oauth"}'
# → 201 {
#     "deviceFlowId": "fa07c61b-…",
#     "userCode": "USER-1",
#     "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device?entry=qwen_code&paywallScene=cli",
#     "verificationUriComplete": "https://chat.qwen.ai/...?user_code=USER-1&entry=qwen_code&paywallScene=cli",
#     "expiresAt": 1700000600000,
#     "intervalMs": 5000,
#     "attached": false
#   }

# 2. Visit the URL on your phone / laptop, enter the user code.
# 3. Poll for completion (or subscribe to SSE for the auth_device_flow_authorized event):
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → status transitions: pending → authorized
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

**守护进程绝不会代你打开浏览器。** 即使在本地运行，守护进程也保持被动 —— 它返回 URL 并让 SDK/用户选择在哪里打开它。这是有意为之：在无头 pod 上调用 `xdg-open` 的守护进程会静默失败，从而掩盖了实际的 auth 表面。在你的客户端中模仿 `gh auth login` 的"按 Enter 键打开浏览器"UX。

**`--require-auth` 与开发便利性。** 设备流路由使用严格变更门控。无 token 的受信任环回默认设置可以直接启动和管理流程；没有凭据的非受信任嵌入返回 `401 token_required`。在共享主机、CI 运行器、远程开发机器或本地进程不相互信任的任何地方，设置受管理的 `QWEN_SERVER_TOKEN` 并传递 `--require-auth`。

**跨守护进程限制。** `oauth_creds.json` 是守护进程共享的（`~/.qwen/oauth_creds.json`），因此在守护进程 A 中成功登录会被守护进程 B 的下一次 token 刷新自动获取 —— 但守护进程 B 的 SDK 客户端不会收到 `auth_device_flow_authorized` 事件（事件是按守护进程隔离的）。

**跨客户端接管。** 同一守护进程上的两个 SDK 客户端若都对同一提供者执行 `POST /workspace/auth/device-flow`，将获得每个提供者的单例：第一次调用启动一个新的 IdP 请求并返回 `attached: false`；第二次调用返回现有的进行中条目并附带 `attached: true`。接管记录在审计跟踪中（在第二个客户端的 `X-Qwen-Client-Id` 下），但不发出单独的事件 —— 一旦用户完成 IdP 页面，两个客户端最终观察到相同的 `auth_device_flow_authorized`。如果你的 UI 区分“我启动了此流程”和“我加入了别人的流程”，请根据 `start()` 返回的 `attached` 字段进行分支。

## 守护进程日志文件

`qwen serve` 在稳定活动路径上跨正常重启追加诊断记录：

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/daemon.log
```

每个文件记录都包含一个随机的每次启动 `runId` 和守护进程 PID。在支持符号链接的平台上，成功的稳定所有者还会将 `debug/daemon/latest` 更新为 `daemon.log`。在 macOS/Linux 上，按如下方式跟随轮转：

```bash
tail -F ~/.qwen/debug/daemon/daemon.log
```

在其他平台上，配置查看器在路径名被替换后重新打开它。仅保留旧文件句柄的查看器将在轮转后继续停留在归档文件中。

日志捕获生命周期消息、路由错误（带有 `route=` 和 `sessionId=` 上下文）、ACP 子进程 stderr，以及 —— 当设置 `QWEN_SERVE_DEBUG=1` 时 —— 额外的桥接面包屑。今天输出到 stderr 的行仍然输出到 stderr；文件日志是**附加的**，而不是替代。

独立的创建失败会添加 `Standalone session creation failed.`，其中包含已验证的目标 `sessionId`、失败的 `phase`、安全的 `reason`、`dispatchState` 和 `cleanupOutcome`。子项创建会保留子项 ID，并将已验证的父项单独记录为 `relatedSessionId`。通过会话 ID 关联 `source_persistence_failed` 行以获取私有源确认或传输详情；`write_not_confirmed` 不会标识文件系统原因。完成的隔离与回滚不同，且 `unknown` 不能确立清理成功。公共错误代码和重试行为保持不变。这些诊断信息省略了原始原因、提示词和源载荷。

活动文件会在超过 10 MiB 之前进行轮转。每个系列在 `archive/` 下保留四个归档文件，并且每个文件记录的上限为 256 KiB。内存队列最多接受 4 MiB 的未结算文件负载。因此，队列压力、轮转失败或文件系统失败可能会丢弃文件副本；`GET /daemon/status?detail=full` 暴露了日志记录器的健康状况、问题以及丢弃的记录/字节计数器。

在一个日志命名空间中，只能有一个守护进程拥有稳定的系列。并发守护进程会写入 `debug/daemon/runs/run-<runId>/daemon.log`；启动横幅和完整状态包含权威路径。`runs/recent-fallback` 是一个尽力而为的定位器，用于最近的回退系列，可能指向仍然活跃的回退系列。健康的命名空间收敛到大约 100 MiB：约 50 MiB 用于稳定系列加上一个非活动的回退系列。活跃的或尚未过期的回退系列会被保留，因此并发守护进程或崩溃/重启风暴可能会暂时使用更多空间。

一个运行时目录就是一个所有权和保留命名空间。当守护进程需要独立的历史记录时，请使用不同的 `QWEN_RUNTIME_DIR` 值。新的守护进程日志目录对用户是私有的（`0700`），并且在 POSIX 系统上新文件使用 `0600`。没有基于年龄的过期机制。

### 禁用

设置 `QWEN_DAEMON_LOG_FILE=0`（或 `false`/`off`/`no`）以完全跳过文件日志记录。Stderr 输出不受影响。

### 与会话调试日志的关系

会话范围的调试日志（`~/.qwen/debug/<sessionId>.txt` 和 `~/.qwen/debug/latest` 符号链接）是独立的。守护进程日志位于同级的 `daemon/` 子目录中；此功能不会改变按会话调试的语义。

### 外部轮转

不要将外部 logrotate 规则指向活动 `daemon.log`。守护进程是唯一受支持的写入者和轮转者；外部的重命名、删除或截断操作会使大小模型失效。在不修改系列的情况下复制或传输记录是安全的。旧的 `serve-<pid>.log` 和 `serve-<pid>-<workspaceHash>.log` 文件不会被触碰，也不计入新的保留策略。

## 运行时 MCP 服务器管理（issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514)） [#runtime-mcp-server-management-issue-4514]

在运行时添加或删除 MCP 服务器，而无需重启守护进程。运行时条目存在于一个临时覆盖层中，该覆盖层会**遮蔽（shadow）** 同名的设置定义服务器；底层的 `settings.json` / `mcpServers` 配置永远不会被写入。

**预检：** 在调用任一路由之前，检查 `caps.features` 中是否包含 `mcp_server_runtime_mutation`。没有此标签的旧版守护进程会返回 `404`。

### `POST /workspace/mcp/servers` —— 添加运行时 MCP 服务器

严格门控（需要受信任的环回主监听器或运维凭据）。通过活动的 `McpClientManager` 立即连接服务器并发现其工具。

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

当 `--mcp-budget-mode=warn` 且添加服务器会超出配置的 `--mcp-client-budget` 时返回。服务器未连接。调用者应向用户显示预算压力。

错误：

| 状态 | 代码                      | 触发条件                                                                                               |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | 名称为空、超过 256 个字符，或包含 `[A-Za-z0-9_-]` 之外的字符                      |
| `400`  | `missing_required_field`  | `config` 缺失或不是非空对象                                                          |
| `400`  | `invalid_client_id`       | 存在 `X-Qwen-Client-Id` 标头，但未在此工作区注册                            |
| `400`  | `invalid_config`          | 配置结构被 MCP 传输验证器拒绝                                               |
| `401`  | `token_required`          | 非受信任的无 token 请求被严格门控拒绝                                                           |
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
| `401`  | `token_required`          | 非受信任的无 token 请求被严格门控拒绝                                      |
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

跳过的响应（`budget_warning_only`, `not_present`）不会发出事件。

现有 `mcp_guardrail_events` 接口中的预算相关事件（`mcp_budget_warning`、`mcp_child_refused_batch`），在运行时新增内容超出预算阈值时也会被触发。

## 下一步

- **设置长期运行的守护进程？** 使用 [本地启动模板 (systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md) 进行服务管理器监督和重启后启动。
- **构建客户端？** 请参阅 [DaemonClient TypeScript 快速入门](../developers/examples/daemon-client-quickstart.md)和 [HTTP 协议参考](../developers/qwen-serve-protocol.md)。
- **阅读源码？** 桥接代码位于 `packages/cli/src/serve/`；SDK 客户端位于 `packages/sdk-typescript/src/daemon/`。
- **追踪路线图？** 阶段 1.5 / 阶段 2 的进度可在 issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) 中查看。
