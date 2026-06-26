# Архитектура демона

## Обзор

Процесс `qwen serve` — это **один демон = одно рабочее пространство**. Он запускает один HTTP-сервер Express, владеет экземпляром `@qwen-code/acp-bridge` и порождает один дочерний процесс ACP (`qwen --acp`), который выполняет фактическую среду выполнения агента. Несколько клиентов (CLI TUI, IDE companion, IM channel bots, web BFFs, пользовательские скрипты) подключаются через HTTP + SSE и либо используют одну сессию ACP (`sessionScope: 'single'`, по умолчанию), либо разделяют сессии по тредам обсуждения (`sessionScope: 'thread'`).

Внутри дочернего процесса ACP MCP-серверы используются всем рабочим пространством через `McpTransportPool` (F2): один кортеж (имя_сервера + отпечаток_конфигурации) отображается на один транспорт MCP, независимо от того, сколько сессий его обнаруживают. `MultiClientPermissionMediator` (F3) моста координирует голосование за разрешения среди всех подключенных клиентов в рамках одной из четырёх политик.

Этот документ даёт общую картину системы, на которой основаны остальные документы документации. Каждый критический поток показан в виде последовательной диаграммы Mermaid; детали реализации каждого компонента находятся в остальных 18 документах.

## Топология процессов

```mermaid
flowchart LR
    subgraph clients["Clients"]
        WUI["Web UI<br/>(packages/webui/src/daemon)"]
        TUI["CLI TUI<br/>(packages/cli/src/ui/daemon)"]
        IDE["VS Code IDE<br/>(packages/vscode-ide-companion)"]
        CH["Channel bots<br/>(DingTalk / WeChat / Telegram / Feishu)"]
        SDK["Any SDK consumer<br/>(packages/sdk-typescript/src/daemon)"]
    end

    subgraph daemon["qwen serve process (one workspace)"]
        EXP["Express app<br/>(packages/cli/src/serve/server.ts)"]
        BR["AcpBridge<br/>(packages/acp-bridge/src/bridge.ts)"]
        MED["MultiClientPermissionMediator<br/>(F3)"]
        EB["EventBus per session<br/>(eventBus.ts)"]
        FS["WorkspaceFileSystem<br/>(cli/src/serve/fs/)"]
    end

    subgraph child["ACP child process (qwen --acp)"]
        AGT["QwenAgent runtime"]
        POOL["McpTransportPool<br/>(F2, core/src/tools)"]
        BDG["WorkspaceMcpBudget"]
    end

    subgraph external["External"]
        MCP1["MCP server A<br/>(stdio)"]
        MCP2["MCP server B<br/>(websocket)"]
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
    POOL -- "shared transport" --> MCP1
    POOL -- "shared transport" --> MCP2
```

Процесс демона и дочерний процесс ACP соединены через `AcpChannel` (по умолчанию: реальная пара stdio-каналов дочернего процесса; `inMemoryChannel` для тестов). Вся работа демона определяется этим разделением: трафик HTTP и SSE завершается в демоне, решения агента и вызовы инструментов выполняются в дочернем процессе, а мост соединяет их.

## Карта пакетов

```mermaid
flowchart TB
    subgraph serve["packages/cli/src/serve"]
        RQS["run-qwen-serve.ts<br/>(bootstrap)"]
        SRV["server.ts (Express)"]
        CAP["capabilities.ts"]
        AUTH["auth.ts"]
        FSM["fs/ (sandbox)"]
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

    subgraph adapters["Adapters"]
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

Три границы доверия имеют значение: граница HTTP (цепочка middleware `serve/auth.ts`), граница между мостом и дочерним процессом ACP (NDJSON через stdio, без аутентификации; дочерний процесс неявно доверяет мосту) и граница между агентом и MCP-сервером (агент может вызывать инструменты, которые взаимодействуют с хостом).

## Workflow 1: жизненный цикл HTTP-запроса

```mermaid
sequenceDiagram
    autonumber
    participant C as Client (SDK)
    participant MW as Middleware<br/>(CORS→host→log→bearer→rate-limit→JSON→telemetry→mutationGate)
    participant R as Route handler
    participant BR as AcpBridge
    participant BC as BridgeClient
    participant CH as ACP child

    C->>MW: POST /session/:id/prompt<br/>Authorization: Bearer …<br/>X-Qwen-Client-Id: …
    MW->>MW: denyBrowserOriginCors
    MW->>MW: hostAllowlist (DNS rebinding guard)
    MW->>MW: access-log hook
    MW->>MW: bearerAuth (constant-time compare)
    MW->>MW: rateLimit (when enabled)
    MW->>MW: express.json body parser
    MW->>MW: daemonTelemetryMiddleware
    MW->>MW: mutationGate (strict on mutating routes)
    MW->>R: req validated
    R->>BR: bridge.sendPrompt(sessionId, body, clientId)
    BR->>BC: client.sendPrompt(sessionId, …)
    BC->>CH: ACP JSON-RPC over stdin
    CH-->>BC: ACP response / notifications
    BC-->>BR: result
    BR-->>R: result
    R-->>C: 200 JSON
```

Маршруты без стриминга (prompt, cancel, переключение модели, метаданные, CRUD рабочего пространства) завершаются одиночным JSON-ответом. Стриминговый вывод доставляется вне полосы по SSE-каналу, **а не** как фрагментированное HTTP-тело на этом соединении. См. workflow 2.

## Workflow 2: доставка и повтор событий SSE

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant SR as GET /session/:id/events
    participant EB as EventBus<br/>(per session)
    participant BC as BridgeClient
    participant CH as ACP child

    C->>SR: GET …/events<br/>Last-Event-ID: 42 (optional)
    SR->>EB: subscribe(lastSeenId=42, maxQueued=N)
    EB-->>SR: replay frames 43..currentTail<br/>(from ring buffer)
    SR-->>C: NDJSON: id=43, type=session_update, …
    CH-->>BC: ACP notification (e.g. agent_message_chunk)
    BC->>EB: publish({type, data})
    EB-->>SR: enqueue id=N
    SR-->>C: id=N, type=…, data=…
    Note over EB,SR: If subscriber queue >= maxQueued,<br/>EventBus emits client_evicted terminal frame<br/>and closes subscriber.
```

Кольцевой буфер ограничен (`eventRingSize`, по умолчанию 8000). Если переподключающийся клиент отправляет `Last-Event-ID`, который старше начала буфера, он получает синтетический сигнал догоняния и должен вызвать `loadSession` / `resumeSession`, чтобы восстановить более глубокое состояние. Медленные клиенты вызывают `slow_client_warning` при заполнении очереди на 75% и `client_evicted` при достижении предела.

## Workflow 3: много клиентское согласование разрешений

```mermaid
sequenceDiagram
    autonumber
    participant CH as ACP child (agent)
    participant BC as BridgeClient.requestPermission
    participant MED as Mediator (policy)
    participant EB as EventBus
    participant C1 as Client A<br/>(originator)
    participant C2 as Client B

    CH->>BC: ACP requestPermission(requestId, options)
    BC->>MED: request({requestId, sessionId, originatorClientId, allowedOptionIds}, timeoutMs)
    MED->>EB: publish permission_request<br/>(broadcast to subscribers)
    EB-->>C1: SSE permission_request
    EB-->>C2: SSE permission_request

    alt first-responder
        C2->>MED: POST /permission/:requestId optionId=allow
        MED-->>BC: resolved
        BC-->>CH: ACP response
        MED->>EB: permission_resolved
        C1->>MED: POST /permission/:requestId (late vote)
        MED-->>C1: 409 permission_already_resolved
    else designated
        C2->>MED: vote (clientId != originatorClientId)
        MED-->>C2: 403 permission_forbidden
        C1->>MED: vote (matches originator)
        MED-->>BC: resolved
    else consensus (N-of-M)
        C1->>MED: vote
        MED->>EB: permission_partial_vote (1/N)
        C2->>MED: vote
        MED->>EB: permission_partial_vote (2/N)
        Note over MED: when tally reaches quorum on one option, resolve
    else local-only
        C2->>MED: vote (remote)
        MED-->>C2: 403 permission_forbidden (remote_not_allowed)
        Note over MED,CH: blocks until a loopback voter resolves it
    end
```

Кросс-политический запасной выход: любой клиент может проголосовать `CANCEL_VOTE_SENTINEL`, чтобы прервать запрос как `cancelled / agent_cancelled`. Мост защищается от попыток протащить sentinel через обычное поле `optionId` из вызовов по сети (`InvalidPermissionOptionError`).

## Workflow 4: захват / освобождение / перезапуск пула транспортов MCP

```mermaid
sequenceDiagram
    autonumber
    participant S as Session in ACP child
    participant P as McpTransportPool
    participant SIF as spawnInFlight (dedup)
    participant E as PoolEntry
    participant BDG as WorkspaceMcpBudget
    participant SRV as MCP server

    S->>P: acquire(name, cfg, sessionId)
    P->>SIF: check inflight for (name+fingerprint)
    alt cached inflight
        SIF-->>P: existing promise
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

    Note over S,P: Session uses entry, then…

    S->>P: release(id, sessionId)
    P->>E: detach session
    E->>E: arm drain timer (default 30s)
    Note over E: refs==0 → drain timer fires → close transport<br/>(MAX_IDLE_MS 5min hard cap survives attach/detach churn)

    Note over S,P: Operator restart flow…
    S->>P: restartByName(name, opts?)
    P->>E: drain + close
    P->>E: spawn replacement
    E->>SRV: reconnect
    P->>EB: publish mcp_server_restarted<br/>with stable entryIndex
    P-->>S: single result or {entries: RestartResult[]}
```

`releaseSession(sessionId)` использует обратный индекс `sessionToEntries`, чтобы освободить все записи, удерживаемые сессией, за O(refs). При завершении демона `drainAll()` устанавливает флаг `draining` (отказывая в новых захватах) и ожидает закрытия каждой записи в течение настраиваемого тайм-аута.

## Workflow 5: жизненный цикл — запуск и корректное завершение

```mermaid
sequenceDiagram
    autonumber
    participant Op as Operator (signal)
    participant RQS as runQwenServe
    participant APP as Express app
    participant BR as AcpBridge
    participant CH as ACP child

    Op->>RQS: qwen serve --workspace … --token …
    RQS->>RQS: validate flags + canonicalize workspace
    RQS->>RQS: allocate PermissionAuditRing
    RQS->>BR: createHttpAcpBridge(options)
    RQS->>APP: createServeApp(bridge, …)
    RQS->>APP: listen(host, port)
    RQS->>RQS: arm SIGINT / SIGTERM handlers

    Op->>RQS: SIGTERM
    RQS->>BR: dispose device-flow registry
    RQS->>BR: bridge.shutdown()
    BR->>CH: send graceful close (10s deadline)
    CH-->>BR: exit
    RQS->>APP: server.close() (5s force-close timer)
    APP->>APP: closeAllConnections() (+2s secondary)
    Note over Op,RQS: Second SIGTERM during shutdown →<br/>bridge.killAllSync() + process.exit(1) (orphan prevention)
```

Двухфазное завершение важно, потому что выполняющиеся HTTP-запросы, активные подписчики SSE и выполняющиеся вызовы инструментов дочернего процесса ACP требуют ограниченных окон завершения. Если что-то блокируется после этих дедлайнов, вступает в силу путь принудительного закрытия, чтобы зависший дочерний процесс не мог удерживать демон активным.

## Критические файлы

| Область                     | Файл                                                          |
| --------------------------- | ------------------------------------------------------------- |
| Загрузка                    | `packages/cli/src/serve/run-qwen-serve.ts`                    |
| Express-приложение          | `packages/cli/src/serve/server.ts`                            |
| Реестр возможностей         | `packages/cli/src/serve/capabilities.ts`                      |
| Middleware аутентификации   | `packages/cli/src/serve/auth.ts`                              |
| Мост                        | `packages/acp-bridge/src/bridge.ts`                           |
| BridgeClient                | `packages/acp-bridge/src/bridgeClient.ts`                     |
| Посредник разрешений        | `packages/acp-bridge/src/permissionMediator.ts`               |
| EventBus                    | `packages/acp-bridge/src/eventBus.ts`                         |
| Пул транспортов MCP         | `packages/core/src/tools/mcp-transport-pool.ts`               |
| Бюджет MCP рабочего пространства | `packages/core/src/tools/mcp-workspace-budget.ts`         |
| Файловая система рабочего пространства | `packages/cli/src/serve/fs/`                          |
| SDK DaemonClient            | `packages/sdk-typescript/src/daemon/DaemonClient.ts`          |
| SDK SessionClient           | `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`   |
| Схема событий               | `packages/sdk-typescript/src/daemon/events.ts`                |

## Ссылки

- Вопросы дизайна: [#3803](https://github.com/QwenLM/qwen-code/issues/3803) (дизайн демона), [#4175](https://github.com/QwenLM/qwen-code/issues/4175) (вехи серии F).
- Руководство пользователя: [`../../users/qwen-serve.md`](../../users/qwen-serve.md).
- Справочник по протоколу: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md).
- Документ дизайна F2: [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md).
- Заметки по дизайну F2: issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175), коммиты 4–6.