# 守护进程架构

## 概述

一个 `qwen serve` 进程 **= 一个守护进程 = 一个工作空间**。它托管一个 Express HTTP 服务器，拥有一个 `@qwen-code/acp-bridge` 实例，并派生一个运行实际代理运行时的 ACP 子进程 (`qwen --acp`)。多个客户端（CLI TUI、IDE 伴侣、IM 频道机器人、Web BFF、自定义脚本）通过 HTTP + SSE 连接，并且要么共享同一个 ACP 会话（`sessionScope: 'single'`，默认），要么按对话线程拆分会话（`sessionScope: 'thread'`）。

在 ACP 子进程中，MCP 服务器通过 `McpTransportPool` (F2) 在工作空间范围内共享：一个（服务器名称 + 配置指纹）元组映射到一个 MCP 传输，无论有多少会话发现它。桥接器的 `MultiClientPermissionMediator` (F3) 在四种策略之一下协调所有已连接客户端的权限投票。

本文档提供了**系统级概览**，其余文档在此基础上展开。每个关键流程均以 Mermaid 时序图展示；各组件实现细节请参见其他 18 篇文档。

## 进程拓扑

```mermaid
flowchart LR
    subgraph clients["客户端"]
        WUI["Web UI<br/>(packages/webui/src/daemon)"]
        TUI["CLI TUI<br/>(packages/cli/src/ui/daemon)"]
        IDE["VS Code IDE<br/>(packages/vscode-ide-companion)"]
        CH["频道机器人<br/>(钉钉 / 微信 / Telegram / 飞书)"]
        SDK["任意 SDK 消费者<br/>(packages/sdk-typescript/src/daemon)"]
    end

    subgraph daemon["qwen serve 进程（一个工作空间）"]
        EXP["Express 应用<br/>(packages/cli/src/serve/server.ts)"]
        BR["AcpBridge<br/>(packages/acp-bridge/src/bridge.ts)"]
        MED["MultiClientPermissionMediator<br/>(F3)"]
        EB["每个会话的 EventBus<br/>(eventBus.ts)"]
        FS["WorkspaceFileSystem<br/>(cli/src/serve/fs/)"]
    end

    subgraph child["ACP 子进程 (qwen --acp)"]
        AGT["QwenAgent 运行时"]
        POOL["McpTransportPool<br/>(F2, core/src/tools)"]
        BDG["WorkspaceMcpBudget"]
    end

    subgraph external["外部"]
        MCP1["MCP 服务器 A<br/>(stdio)"]
        MCP2["MCP 服务器 B<br/>(websocket)"]
    end

    WUI -- "HTTP+SSE" --> EXP
    TUI -- "HTTP+SSE" --> EXP
    IDE -- "HTTP+SSE (loopback)" --> EXP
    CH -- "HTTP+SSE" --> EXP
    SDK -- "HTTP+SSE" --> EXP

    EXP --> BR
    BR --> MED
    BR --> EB
    EXP --> FS

    BR -- "ACP NDJSON over stdio" --> AGT
    AGT --> POOL
    POOL --> BDG
    POOL -- "共享传输" --> MCP1
    POOL -- "共享传输" --> MCP2
```

守护进程与 ACP 子进程通过 `AcpChannel` 连接（默认使用真实的子进程 stdio 管道对；测试时使用 `inMemoryChannel`）。守护进程的所有行为都受此分离影响：HTTP 和 SSE 流量在守护进程中终结，代理决策和工具调用在子进程中发生，而桥接器则连接两者。

## 包结构图

```mermaid
flowchart TB
    subgraph serve["packages/cli/src/serve"]
        RQS["run-qwen-serve.ts<br/>(引导)"]
        SRV["server.ts (Express)"]
        CAP["capabilities.ts"]
        AUTH["auth.ts"]
        FSM["fs/ (沙箱)"]
        DSP["daemon-status-provider.ts"]
    end

    subgraph br["packages/acp-bridge"]
        BR2["bridge.ts"]
        BC2["bridgeClient.ts"]
        EB2["eventBus.ts"]
        MED2["permissionMediator.ts"]
        ST2["status.ts"]
        CH2["channel.ts / spawnChannel.ts"]
    end

    subgraph core["packages/core/src/tools"]
        POOL2["mcp-transport-pool.ts"]
        ENT["mcp-pool-entry.ts"]
        WBG["mcp-workspace-budget.ts"]
        SMV["session-mcp-view.ts"]
    end

    subgraph sdk["packages/sdk-typescript/src/daemon"]
        DC["DaemonClient.ts"]
        DSC["DaemonSessionClient.ts"]
        EVT["events.ts"]
        SSE["sse.ts"]
        AUTHF["DaemonAuthFlow.ts"]
        UI["ui/* (#4328 + #4353)<br/>normalizer / transcript / store / render"]
    end

    subgraph adapters["适配器"]
        WUIP["webui/src/daemon/<br/>DaemonSessionProvider.tsx"]
        TUIA["cli/src/ui/daemon/<br/>daemon-tui-adapter.ts"]
        CHB["channels/base/<br/>DaemonChannelBridge.ts"]
        DT["channels/dingtalk"]
        WX["channels/weixin"]
        TG["channels/telegram"]
        FS["channels/feishu"]
        IDEA["vscode-ide-companion/<br/>daemonIdeConnection.ts"]
    end

    RQS --> SRV
    RQS --> CAP
    RQS --> AUTH
    RQS --> FSM
    RQS --> BR2

    BR2 --> BC2
    BR2 --> EB2
    BR2 --> MED2
    BR2 --> CH2

    BR2 -.spawns.-> core
    POOL2 --> ENT
    POOL2 --> WBG
    POOL2 --> SMV

    WUIP --> DSC
    WUIP --> UI
    TUIA --> DSC
    CHB --> DSC
    DT --> CHB
    WX --> CHB
    TG --> CHB
    IDEA --> DSC

    DSC --> DC
    DC --> EVT
    DC --> SSE
    DC --> AUTHF
```

三个信任边界值得关注：HTTP 边缘（`serve/auth.ts` 中间件链）、桥接器到 ACP 子进程边界（NDJSON over stdio，无认证；子进程完全信任桥接器）、以及代理到 MCP 服务器边界（代理可以调用触及主机的工具）。

## 工作流 1：HTTP 请求生命周期

```mermaid
sequenceDiagram
    autonumber
    participant C as 客户端 (SDK)
    participant MW as 中间件<br/>(CORS→host→log→bearer→rate-limit→JSON→telemetry→mutationGate)
    participant R as 路由处理器
    participant BR as AcpBridge
    participant BC as BridgeClient
    participant CH as ACP 子进程

    C->>MW: POST /session/:id/prompt<br/>Authorization: Bearer …<br/>X-Qwen-Client-Id: …
    MW->>MW: denyBrowserOriginCors
    MW->>MW: hostAllowlist (DNS 重新绑定防护)
    MW->>MW: access-log hook
    MW->>MW: bearerAuth (恒定时间比较)
    MW->>MW: rateLimit (启用时)
    MW->>MW: express.json body parser
    MW->>MW: daemonTelemetryMiddleware
    MW->>MW: mutationGate (对变更型路由严格处理)
    MW->>R: 请求已验证
    R->>BR: bridge.sendPrompt(sessionId, body, clientId)
    BR->>BC: client.sendPrompt(sessionId, …)
    BC->>CH: ACP JSON-RPC over stdin
    CH-->>BC: ACP 响应/通知
    BC-->>BR: 结果
    BR-->>R: 结果
    R-->>C: 200 JSON
```

非流式路由（prompt、cancel、model switch、metadata、workspace CRUD）以单个 JSON 回复终止。流式输出通过 SSE 通道带外传送，**并非**此连接的分块 HTTP 响应体。参见工作流 2。

## 工作流 2：SSE 事件传递与重播

```mermaid
sequenceDiagram
    autonumber
    participant C as 客户端
    participant SR as GET /session/:id/events
    participant EB as EventBus<br/>(每个会话)
    participant BC as BridgeClient
    participant CH as ACP 子进程

    C->>SR: GET …/events<br/>Last-Event-ID: 42 (可选)
    SR->>EB: subscribe(lastSeenId=42, maxQueued=N)
    EB-->>SR: replay frames 43..currentTail<br/>(从环形缓冲区)
    SR-->>C: NDJSON: id=43, type=session_update, …
    CH-->>BC: ACP 通知 (例如 agent_message_chunk)
    BC->>EB: publish({type, data})
    EB-->>SR: enqueue id=N
    SR-->>C: id=N, type=…, data=…
    Note over EB,SR: 如果订阅者队列 >= maxQueued，<br/>EventBus 发出 client_evicted 终端帧<br/>并关闭订阅者。
```

环形缓冲区有界 (`eventRingSize`, 默认 8000)。重新连接的客户端如果 `Last-Event-ID` 早于环形缓冲区头部，将收到合成的 catch-up 信号，并必须调用 `loadSession` / `resumeSession` 来重建更深的状态。慢速客户端在队列填充 75% 时触发 `slow_client_warning`，在达到上限时触发 `client_evicted`。

## 工作流 3：多客户端权限协调

```mermaid
sequenceDiagram
    autonumber
    participant CH as ACP 子进程 (代理)
    participant BC as BridgeClient.requestPermission
    participant MED as 协调器 (策略)
    participant EB as EventBus
    participant C1 as 客户端 A<br/>(发起者)
    participant C2 as 客户端 B

    CH->>BC: ACP requestPermission(requestId, options)
    BC->>MED: request({requestId, sessionId, originatorClientId, allowedOptionIds}, timeoutMs)
    MED->>EB: publish permission_request<br/>(广播给订阅者)
    EB-->>C1: SSE permission_request
    EB-->>C2: SSE permission_request

    alt first-responder
        C2->>MED: POST /permission/:requestId optionId=allow
        MED-->>BC: resolved
        BC-->>CH: ACP 响应
        MED->>EB: permission_resolved
        C1->>MED: POST /permission/:requestId (迟到投票)
        MED-->>C1: 409 permission_already_resolved
    else designated
        C2->>MED: vote (clientId != originatorClientId)
        MED-->>C2: 403 permission_forbidden
        C1->>MED: vote (匹配发起者)
        MED-->>BC: resolved
    else consensus (N-of-M)
        C1->>MED: vote
        MED->>EB: permission_partial_vote (1/N)
        C2->>MED: vote
        MED->>EB: permission_partial_vote (2/N)
        Note over MED: 当某个选项的票数达到法定人数时，resolve
    else local-only
        C2->>MED: vote (远程)
        MED-->>C2: 403 permission_forbidden (remote_not_allowed)
        Note over MED,CH: 阻塞直到本地投票者解决
    end
```

跨策略逃生舱口：任何客户端可以投票 `CANCEL_VOTE_SENTINEL` 来短路请求，使其变为 `cancelled / agent_cancelled`。桥接器阻止网络调用者通过普通 `optionId` 字段夹带哨兵（`InvalidPermissionOptionError`）。

## 工作流 4：MCP 传输池获取 / 释放 / 重启

```mermaid
sequenceDiagram
    autonumber
    participant S as ACP 子进程中的会话
    participant P as McpTransportPool
    participant SIF as spawnInFlight (去重)
    participant E as PoolEntry
    participant BDG as WorkspaceMcpBudget
    participant SRV as MCP 服务器

    S->>P: acquire(name, cfg, sessionId)
    P->>SIF: 检查 (name+fingerprint) 的 inflight
    alt cached inflight
        SIF-->>P: 已有 promise
    else cold start
        P->>BDG: tryReserve(name)
        BDG-->>P: ok / refused
        alt refused
            P-->>S: BudgetExhaustedError
        else ok
            P->>E: new PoolEntry(...)
            E->>SRV: connect transport
            SRV-->>E: ready
            E-->>P: connected
        end
    end
    P->>P: sessionToEntries.add(sessionId, id)
    P-->>S: PooledConnection

    Note over S,P: 会话使用 entry，然后…

    S->>P: release(id, sessionId)
    P->>E: detach session
    E->>E: arm drain timer (默认 30s)
    Note over E: refs==0 → drain timer fires → close transport<br/>(MAX_IDLE_MS 5min hard cap survives attach/detach churn)

    Note over S,P: 操作员重启流程…
    S->>P: restartByName(name, opts?)
    P->>E: drain + close
    P->>E: spawn replacement
    E->>SRV: reconnect
    P->>EB: publish mcp_server_restarted<br/>with stable entryIndex
    P-->>S: single result 或 {entries: RestartResult[]}
```

`releaseSession(sessionId)` 使用反向索引 `sessionToEntries` 以 O(refs) 的时间复杂度释放该会话持有的所有 entry。守护进程关闭时，`drainAll()` 设置 `draining` 标志（拒绝新的 acquire），并在可配置超时内等待每个 entry 关闭。

## 工作流 5：生命周期——启动与优雅关闭

```mermaid
sequenceDiagram
    autonumber
    participant Op as 操作者 (信号)
    participant RQS as runQwenServe
    participant APP as Express 应用
    participant BR as AcpBridge
    participant CH as ACP 子进程

    Op->>RQS: qwen serve --workspace … --token …
    RQS->>RQS: 验证标志 + 规范化工作空间
    RQS->>RQS: 分配 PermissionAuditRing
    RQS->>BR: createHttpAcpBridge(options)
    RQS->>APP: createServeApp(bridge, …)
    RQS->>APP: listen(host, port)
    RQS->>RQS: 安装 SIGINT / SIGTERM 处理器

    Op->>RQS: SIGTERM
    RQS->>BR: dispose device-flow registry
    RQS->>BR: bridge.shutdown()
    BR->>CH: 发送优雅关闭 (10s 截止时间)
    CH-->>BR: exit
    RQS->>APP: server.close() (5s 强制关闭计时器)
    APP->>APP: closeAllConnections() (+2s 二级)
    Note over Op,RQS: 关闭期间第二个 SIGTERM →<br/>bridge.killAllSync() + process.exit(1) (孤儿进程防护)
```

两阶段关闭之所以重要，是因为进行中的 HTTP 请求、进行中的 SSE 订阅者和 ACP 子进程中进行中的工具调用都需要有界的关闭窗口。如果任何操作在这些截止时间后仍被阻塞，强制关闭路径将接管，以确保挂起的子进程不会阻止守护进程退出。

## 关键文件

| 关注点               | 文件                                                            |
| -------------------- | --------------------------------------------------------------- |
| 引导                  | `packages/cli/src/serve/run-qwen-serve.ts`                      |
| Express 应用          | `packages/cli/src/serve/server.ts`                              |
| 能力注册表             | `packages/cli/src/serve/capabilities.ts`                       |
| 认证中间件             | `packages/cli/src/serve/auth.ts`                                |
| 桥接器                | `packages/acp-bridge/src/bridge.ts`                             |
| BridgeClient          | `packages/acp-bridge/src/bridgeClient.ts`                       |
| 权限协调器             | `packages/acp-bridge/src/permissionMediator.ts`                 |
| EventBus              | `packages/acp-bridge/src/eventBus.ts`                           |
| MCP 传输池            | `packages/core/src/tools/mcp-transport-pool.ts`                 |
| 工作空间 MCP 预算      | `packages/core/src/tools/mcp-workspace-budget.ts`               |
| 工作空间文件系统        | `packages/cli/src/serve/fs/`                                    |
| SDK DaemonClient      | `packages/sdk-typescript/src/daemon/DaemonClient.ts`            |
| SDK SessionClient     | `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`     |
| 事件模式               | `packages/sdk-typescript/src/daemon/events.ts`                 |

## 参考资料

- 设计问题: [#3803](https://github.com/QwenLM/qwen-code/issues/3803) (守护进程设计), [#4175](https://github.com/QwenLM/qwen-code/issues/4175) (F 系列里程碑).
- 用户指南: [`../../users/qwen-serve.md`](../../users/qwen-serve.md).
- 有线协议参考: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md).
- F2 设计文档: [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md).
- F2 设计说明: issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) 提交 4-6.