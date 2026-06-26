# Daemon-Architektur

## Übersicht

Ein `qwen serve`-Prozess ist **ein Daemon = ein Workspace**. Er beherbergt einen einzelnen Express-HTTP-Server, besitzt eine `@qwen-code/acp-bridge`-Instanz und erzeugt einen ACP-Kindprozess (`qwen --acp`), der die eigentliche Agent-Laufzeitumgebung ausführt. Mehrere Clients (CLI TUI, IDE-Begleiter, IM-Channel-Bots, Web-BFFs, benutzerdefinierte Skripte) verbinden sich über HTTP + SSE und teilen sich entweder eine ACP-Sitzung (`sessionScope: 'single'`, Standard) oder teilen Sitzungen nach Gesprächsfaden auf (`sessionScope: 'thread'`).

Innerhalb des ACP-Kindprozesses werden MCP-Server Workspace-weit über `McpTransportPool` (F2) gemeinsam genutzt: Ein einzelnes Tupel aus (Servername + Konfigurationsfingerabdruck) wird auf einen MCP-Transport abgebildet, unabhängig davon, wie viele Sitzungen ihn entdecken. Der `MultiClientPermissionMediator` (F3) der Bridge koordiniert Berechtigungsvoten aller verbundenen Clients unter einer von vier Richtlinien.

Dieses Dokument liefert das **Systembild**, auf dem der Rest dieser Dokumentation aufbaut. Jeder kritische Ablauf wird als Mermaid-Sequenzdiagramm dargestellt; Details zur Implementierung der einzelnen Komponenten finden sich in den anderen 18 Dokumenten.

## Prozesstopologie

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

Der Daemon-Prozess und der ACP-Kindprozess sind über einen `AcpChannel` verbunden (Standard: ein reales stdio-Pipe-Paar des Unterprozesses; `inMemoryChannel` für Tests). Alles, was der Daemon tut, wird durch diese Aufteilung bestimmt: HTTP- und SSE-Datenverkehr enden im Daemon, Agentenentscheidungen und Tool-Aufrufe finden im Kindprozess statt, und die Bridge verbindet die beiden.

## Paketübersicht

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

Drei Vertrauensgrenzen sind relevant: die HTTP-Kante (`serve/auth.ts` Middleware-Kette), die Grenze zwischen Bridge und ACP-Kindprozess (NDJSON über stdio, keine Authentifizierung; der Kindprozess vertraut der Bridge implizit) und die Grenze zwischen Agent und MCP-Server (der Agent kann Tools aufrufen, die den Host berühren).

## Workflow 1: HTTP-Request-Lebenszyklus

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

Nicht-Streaming-Routen (Prompt, Cancel, Modellwechsel, Metadaten, Workspace CRUD) enden als einzelne JSON-Antwort. Streaming-Ausgabe wird out-of-band auf dem SSE-Kanal geliefert, **nicht** als chunked HTTP-Body auf dieser Verbindung. Siehe Workflow 2.

## Workflow 2: SSE-Event-Zustellung und -Wiederholung

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

Der Ringpuffer ist begrenzt (`eventRingSize`, Standard 8000). Ein sich wieder verbindender Client, dessen `Last-Event-ID` älter als der Kopf des Rings ist, erhält ein synthetisches Catch-up-Signal und muss `loadSession` / `resumeSession` aufrufen, um den tieferen Zustand wiederherzustellen. Langsame Clients lösen bei 75 % Queue-Füllung `slow_client_warning` und am Cap `client_evicted` aus.

## Workflow 3: Multi-Client-Berechtigungsvermittlung

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

Übergreifende Notluke: Jeder Client kann `CANCEL_VOTE_SENTINEL` stimmen, um die Anfrage als `cancelled / agent_cancelled` abzukürzen. Die Bridge verhindert, dass Aufrufer von außen den Sentinel über das normale `optionId`-Feld einschmuggeln (`InvalidPermissionOptionError`).

## Workflow 4: MCP-Transportpool – Akquise / Freigabe / Neustart

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

`releaseSession(sessionId)` nutzt den umgekehrten `sessionToEntries`-Index, um jeden Eintrag, den die Sitzung hält, in O(refs) freizugeben. Beim Herunterfahren des Daemons setzt `drainAll()` das `draining`-Flag (lehnt neue Akquises ab) und wartet darauf, dass jeder Eintrag unter einem konfigurierbaren Timeout schließt.

## Workflow 5: Lebenszyklus – Start und sauberes Herunterfahren

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

Die zweiphasige Abschaltung ist wichtig, weil laufende HTTP-Requests, laufende SSE-Abonnenten und die laufenden Tool-Aufrufe des ACP-Kindprozesses begrenzte Beendigungsfenster benötigen. Wenn etwas diese Fristen überschreitet, übernimmt der erzwungene Schließpfad, damit ein festsitzender Kindprozess den Daemon-Prozess nicht am Leben halten kann.

## Kritische Dateien

| Bereich                     | Datei                                                         |
| --------------------------- | ------------------------------------------------------------- |
| Bootstrap                   | `packages/cli/src/serve/run-qwen-serve.ts`                     |
| Express-App                 | `packages/cli/src/serve/server.ts`                            |
| Capability-Registry         | `packages/cli/src/serve/capabilities.ts`                      |
| Auth-Middleware             | `packages/cli/src/serve/auth.ts`                              |
| Bridge                      | `packages/acp-bridge/src/bridge.ts`                           |
| BridgeClient                | `packages/acp-bridge/src/bridgeClient.ts`                     |
| Permission-Mediator         | `packages/acp-bridge/src/permissionMediator.ts`               |
| EventBus                    | `packages/acp-bridge/src/eventBus.ts`                         |
| MCP-Transportpool           | `packages/core/src/tools/mcp-transport-pool.ts`               |
| Workspace-MCP-Budget        | `packages/core/src/tools/mcp-workspace-budget.ts`            |
| Workspace-Dateisystem       | `packages/cli/src/serve/fs/`                                  |
| SDK DaemonClient            | `packages/sdk-typescript/src/daemon/DaemonClient.ts`          |
| SDK SessionClient           | `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`   |
| Event-Schema                | `packages/sdk-typescript/src/daemon/events.ts`                |

## Referenzen

- Design-Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803) (Daemon-Design), [#4175](https://github.com/QwenLM/qwen-code/issues/4175) (F-Serie-Meilensteine).
- Benutzerhandbuch: [`../../users/qwen-serve.md`](../../users/qwen-serve.md).
- Wire-Protokoll-Referenz: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md).
- F2-Designdokument: [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md).
- F2-Designnotizen: Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Commits 4-6.