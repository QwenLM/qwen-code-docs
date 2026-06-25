# Архитектура демона

## Обзор

Процесс `qwen serve` — это **один демон = одно рабочее пространство**. Он запускает один HTTP-сервер Express, владеет экземпляром `@qwen-code/acp-bridge` и порождает один дочерний процесс ACP (`qwen --acp`), который выполняет саму среду агента. Несколько клиентов (CLI TUI, IDE-компаньон, боты каналов, веб-BFF, пользовательские скрипты) подключаются по HTTP + SSE и либо используют одну ACP-сессию (`sessionScope: 'single'`, по умолчанию), либо разделяют сессии по потокам общения (`sessionScope: 'thread'`).

Внутри дочернего ACP-процесса MCP-серверы являются общими для всего рабочего пространства через `McpTransportPool` (F2): кортеж (имя_сервера + отпечаток_конфигурации) отображается ровно на один MCP-транспорт, независимо от того, сколько сессий его обнаруживают. `MultiClientPermissionMediator` (F3) координатует голосование за разрешения от всех подключенных клиентов в рамках одной из четырёх политик.

Этот документ даёт **системную картину**, на которую опирается остальная документация. Каждый критический поток показан в виде диаграммы последовательности Mermaid; детали реализации компонентов живут в остальных 18 документах.

## Топология процессов

```mermaid
flowchart LR
    subgraph clients["Клиенты"]
        WUI["Веб-интерфейс<br/>(packages/webui/src/daemon)"]
        TUI["CLI TUI<br/>(packages/cli/src/ui/daemon)"]
        IDE["VS Code IDE<br/>(packages/vscode-ide-companion)"]
        CH["Боты каналов<br/>(DingTalk / WeChat / Telegram / Feishu)"]
        SDK["Любой потребитель SDK<br/>(packages/sdk-typescript/src/daemon)"]
    end

    subgraph daemon["Процесс qwen serve (одно рабочее пространство)"]
        EXP["Приложение Express<br/>(packages/cli/src/serve/server.ts)"]
        BR["AcpBridge<br/>(packages/acp-bridge/src/bridge.ts)"]
        MED["MultiClientPermissionMediator<br/>(F3)"]
        EB["EventBus на сессию<br/>(eventBus.ts)"]
        FS["WorkspaceFileSystem<br/>(cli/src/serve/fs/)"]
    end

    subgraph child["Дочерний процесс ACP (qwen --acp)"]
        AGT["Среда QwenAgent"]
        POOL["McpTransportPool<br/>(F2, core/src/tools)"]
        BDG["WorkspaceMcpBudget"]
    end

    subgraph external["Внешние"]
        MCP1["MCP-сервер A<br/>(stdio)"]
        MCP2["MCP-сервер B<br/>(websocket)"]
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

    BR -- "ACP NDJSON по stdio" --> AGT
    AGT --> POOL
    POOL --> BDG
    POOL -- "общий транспорт" --> MCP1
    POOL -- "общий транспорт" --> MCP2
```

Процесс демона и дочерний процесс ACP соединены через `AcpChannel` (по умолчанию: реальная пара stdio-каналов дочернего процесса; `inMemoryChannel` для тестов). Всё, что делает демон, определяется этим разделением: HTTP- и SSE-трафик завершается в демоне, решения агента и вызовы инструментов выполняются в дочернем процессе, а мост соединяет их.

## Карта пакетов

```mermaid
flowchart TB
    subgraph serve["packages/cli/src/serve"]
        RQS["run-qwen-serve.ts<br/>(загрузка)"]
        SRV["server.ts (Express)"]
        CAP["capabilities.ts"]
        AUTH["auth.ts"]
        FSM["fs/ (песочница)"]
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
        UI["ui/* (#4328 + #4353)<br/>нормализатор / транскрипт / хранилище / рендер"]
    end

    subgraph adapters["Адаптеры"]
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

    BR2 -.порождает.-> core
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

Три границы доверия имеют значение: HTTP-граница (цепочка middleware из `serve/auth.ts`), граница между мостом и дочерним процессом ACP (NDJSON по stdio, без аутентификации; дочерний процесс доверяет мосту неявно) и граница между агентом и MCP-сервером (агент может вызывать инструменты, взаимодействующие с хостом).
## Сценарий 1: Жизненный цикл HTTP-запроса

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

Нестримингые маршруты (prompt, cancel, model switch, metadata, workspace CRUD) завершаются одним JSON-ответом. Потоковый вывод доставляется вне полосы (out-of-band) по SSE-каналу, **не** в виде фрагментированного HTTP-тела в этом соединении. Смотрите сценарий 2.

## Сценарий 2: Доставка и повторное воспроизведение SSE-событий

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

Кольцевой буфер ограничен (`eventRingSize`, по умолчанию 8000). Переподключающийся клиент, чей `Last-Event-ID` старше головы буфера, получает синтетический сигнал синхронизации и должен вызвать `loadSession` / `resumeSession` для восстановления более глубокого состояния. Медленные клиенты инициируют `slow_client_warning` при заполнении очереди на 75% и `client_evicted` при достижении предела.

## Сценарий 3: Посредничество разрешений для нескольких клиентов

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

Аварийный выход для кроссполитик: любой клиент может проголосовать `CANCEL_VOTE_SENTINEL`, чтобы замкнуть запрос как `cancelled / agent_cancelled`. Мост защищает от попыток проводных вызывающих абонентов протащить sentinel через обычное поле `optionId` (`InvalidPermissionOptionError`).

## Сценарий 4: Получение/освобождение/перезапуск пула MCP-транспортов

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
`releaseSession(sessionId)` использует обратный индекс `sessionToEntries`, чтобы освободить все записи, удерживаемые сессией, за O(refs). При завершении демона `drainAll()` устанавливает флаг `draining` (отказываясь от новых захватов) и ожидает закрытия каждой записи в пределах настраиваемого таймаута.

## Workflow 5: Жизненный цикл — запуск и корректное завершение

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

Двухфазное завершение важно, потому что текущие HTTP-запросы, активные подписчики SSE и текущие вызовы инструментов дочернего процесса ACP — все требуют ограниченных окон для завершения. Если что-то блокирует выполнение дольше установленных сроков, вступает в силу принудительное закрытие, чтобы зависший дочерний процесс не удерживал процесс демона в живых.

## Критические файлы

| Область ответственности      | Файл                                                        |
| ---------------------------- | ------------------------------------------------------------|
| Загрузка                     | `packages/cli/src/serve/run-qwen-serve.ts`                    |
| Express приложение           | `packages/cli/src/serve/server.ts`                          |
| Реестр возможностей          | `packages/cli/src/serve/capabilities.ts`                      |
| Промежуточное ПО аутентификации | `packages/cli/src/serve/auth.ts`                            |
| Мост (Bridge)                | `packages/acp-bridge/src/bridge.ts`                         |
| BridgeClient                 | `packages/acp-bridge/src/bridgeClient.ts`                   |
| Посредник разрешений         | `packages/acp-bridge/src/permissionMediator.ts`             |
| EventBus                     | `packages/acp-bridge/src/eventBus.ts`                       |
| Пул транспортов MCP          | `packages/core/src/tools/mcp-transport-pool.ts`             |
| Бюджет MCP рабочей области   | `packages/core/src/tools/mcp-workspace-budget.ts`           |
| Файловая система рабочей области | `packages/cli/src/serve/fs/`                                |
| SDK DaemonClient             | `packages/sdk-typescript/src/daemon/DaemonClient.ts`        |
| SDK SessionClient            | `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts` |
| Схема событий                | `packages/sdk-typescript/src/daemon/events.ts`              |

## Ссылки

- Дизайн-issue: [#3803](https://github.com/QwenLM/qwen-code/issues/3803) (дизайн демона), [#4175](https://github.com/QwenLM/qwen-code/issues/4175) (вехи F-серии).
- Руководство пользователя: [`../../users/qwen-serve.md`](../../users/qwen-serve.md).
- Спецификация протокола по проводам: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md).
- Дизайн-документ F2: [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md).
- Заметки к дизайну F2: issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175), коммиты 4–6.
