# Daemon-Architektur

## Übersicht

Ein `qwen serve`-Prozess ist **ein Daemon = ein Workspace**. Er hostet einen einzelnen Express-HTTP-Server, besitzt eine Instanz von `@qwen-code/acp-bridge` und erzeugt einen ACP-Kindprozess (`qwen --acp`), der die eigentliche Agent-Laufzeitumgebung ausführt. Mehrere Clients (CLI TUI, IDE-Begleitprogramm, IM-Kanal-Bots, Web-BFFs, benutzerdefinierte Skripte) verbinden sich über HTTP + SSE und teilen sich entweder eine ACP-Sitzung (`sessionScope: 'single'`, Standard) oder teilen Sitzungen nach Konversationsthread auf (`sessionScope: 'thread'`).

Innerhalb des ACP-Kindprozesses werden MCP-Server workspace-weit über `McpTransportPool` (F2) gemeinsam genutzt: Ein einzelnes Tupel (Servername + Konfigurationsfingerabdruck) wird auf einen MCP-Transport abgebildet, unabhängig davon, wie viele Sitzungen ihn entdecken. Der `MultiClientPermissionMediator` (F3) der Brücke koordiniert Berechtigungsabstimmungen über alle verbundenen Clients hinweg unter einer von vier Richtlinien.

Dieses Dokument gibt das **Systembild auf höchster Ebene**, auf dem der Rest dieses Dokumentsatzes aufbaut. Jeder kritische Ablauf wird als Mermaid-Sequenzdiagramm dargestellt; komponentenspezifische Implementierungsdetails finden sich in den anderen 18 Dokumenten.

## Prozess-Topologie

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

Der Daemon-Prozess und der ACP-Kindprozess sind über einen `AcpChannel` verbunden (Standard: ein echter Subprozess-stdio-Pipepaar; `inMemoryChannel` für Tests). Alles, was der Daemon tut, wird durch diese Aufteilung bestimmt: HTTP- und SSE-Daten enden im Daemon, Agent-Entscheidungen und Tool-Aufrufe finden im Kindprozess statt, und die Brücke verbindet beide.

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

Drei Vertrauensgrenzen sind von Bedeutung: der HTTP-Rand (Middleware-Kette von `serve/auth.ts`), die Grenze zwischen Brücke und ACP-Kindprozess (NDJSON über stdio, keine Authentifizierung; der Kindprozess vertraut der Brücke implizit) und die Grenze zwischen Agent und MCP-Server (der Agent kann Tools aufrufen, die den Host berühren).
## Workflow 1: HTTP-Anfrage-Lebenszyklus

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
    MW->>MW: hostAllowlist (DNS-Rebinding-Schutz)
    MW->>MW: access-log-Hook
    MW->>MW: bearerAuth (konstantzeitlicher Vergleich)
    MW->>MW: rateLimit (wenn aktiviert)
    MW->>MW: express.json-Body-Parser
    MW->>MW: daemonTelemetryMiddleware
    MW->>MW: mutationGate (streng bei mutierenden Routen)
    MW->>R: req validiert
    R->>BR: bridge.sendPrompt(sessionId, body, clientId)
    BR->>BC: client.sendPrompt(sessionId, …)
    BC->>CH: ACP JSON-RPC über stdin
    CH-->>BC: ACP-Antwort / Benachrichtigungen
    BC-->>BR: Ergebnis
    BR-->>R: Ergebnis
    R-->>C: 200 JSON
```

Nicht-Streaming-Routen (prompt, cancel, Modellwechsel, Metadaten, Workspace-CRUD) enden als einzelne JSON-Antwort. Streaming-Ausgaben werden out-of-band über den SSE-Kanal geliefert, **nicht** als chunked HTTP-Body auf dieser Verbindung. Siehe Workflow 2.

## Workflow 2: SSE-Ereignisauslieferung und -Wiederholung

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant SR as GET /session/:id/events
    participant EB as EventBus<br/>(pro Sitzung)
    participant BC as BridgeClient
    participant CH as ACP child

    C->>SR: GET …/events<br/>Last-Event-ID: 42 (optional)
    SR->>EB: subscribe(lastSeenId=42, maxQueued=N)
    EB-->>SR: Wiedergabe der Frames 43..currentTail<br/>(aus Ringpuffer)
    SR-->>C: NDJSON: id=43, type=session_update, …
    CH-->>BC: ACP-Benachrichtigung (z.B. agent_message_chunk)
    BC->>EB: publish({type, data})
    EB-->>SR: enqueue id=N
    SR-->>C: id=N, type=…, data=…
    Note over EB,SR: Wenn Abonnenten-Warteschlange >= maxQueued,<br/>sendet EventBus einen client_evicted-Abschlussframe<br/>und schließt den Abonnenten.
```

Der Ringpuffer ist begrenzt (`eventRingSize`, Standard 8000). Ein Client, der sich mit einer `Last-Event-ID` wieder verbindet, die älter als der Kopf des Rings ist, erhält ein synthetisches Aufholsignal und muss `loadSession` / `resumeSession` aufrufen, um den tieferen Zustand wiederherzustellen. Langsame Clients lösen bei 75 % Warteschlangenfüllung `slow_client_warning` und bei Erreichen des Grenzwerts `client_evicted` aus.

## Workflow 3: Mehrfach-Client-Berechtigungsvermittlung

```mermaid
sequenceDiagram
    autonumber
    participant CH as ACP child (Agent)
    participant BC as BridgeClient.requestPermission
    participant MED as Mediator (Richtlinie)
    participant EB as EventBus
    participant C1 as Client A<br/>(Auslöser)
    participant C2 as Client B

    CH->>BC: ACP requestPermission(requestId, options)
    BC->>MED: request({requestId, sessionId, originatorClientId, allowedOptionIds}, timeoutMs)
    MED->>EB: publish permission_request<br/>(Broadcast an Abonnenten)
    EB-->>C1: SSE permission_request
    EB-->>C2: SSE permission_request

    alt first-responder
        C2->>MED: POST /permission/:requestId optionId=allow
        MED-->>BC: resolved
        BC-->>CH: ACP-Antwort
        MED->>EB: permission_resolved
        C1->>MED: POST /permission/:requestId (verspätete Stimme)
        MED-->>C1: 409 permission_already_resolved
    else designated
        C2->>MED: Stimme (clientId != originatorClientId)
        MED-->>C2: 403 permission_forbidden
        C1->>MED: Stimme (stimmt mit originator überein)
        MED-->>BC: resolved
    else Konsens (N-von-M)
        C1->>MED: Stimme
        MED->>EB: permission_partial_vote (1/N)
        C2->>MED: Stimme
        MED->>EB: permission_partial_vote (2/N)
        Note over MED: Wenn die Zählung bei einer Option das Quorum erreicht, auflösen
    else local-only
        C2->>MED: Stimme (remote)
        MED-->>C2: 403 permission_forbidden (remote_not_allowed)
        Note over MED,CH: Blockiert, bis ein Loopback-Wähler die Anfrage auflöst
    end
```

Richtlinienübergreifender Notausstieg: Jeder Client kann mit `CANCEL_VOTE_SENTINEL` stimmen, um die Anfrage als `cancelled / agent_cancelled` abzubrechen. Die Bridge schützt vor Drahtanrufern, die den Sentinel über das normale `optionId`-Feld schmuggeln (`InvalidPermissionOptionError`).

## Workflow 4: MCP-Transport-Pool – Erwerb / Freigabe / Neustart

```mermaid
sequenceDiagram
    autonumber
    participant S as Sitzung im ACP child
    participant P as McpTransportPool
    participant SIF as spawnInFlight (Deduplizierung)
    participant E as PoolEntry
    participant BDG as WorkspaceMcpBudget
    participant SRV as MCP-Server

    S->>P: acquire(name, cfg, sessionId)
    P->>SIF: Inflight-Prüfung für (name+fingerprint)
    alt gecachter Inflight
        SIF-->>P: vorhandenes Promise
    else Kaltstart
        P->>BDG: tryReserve(name)
        BDG-->>P: ok / abgelehnt
        alt abgelehnt
            P-->>S: BudgetExhaustedError
        else ok
            P->>E: new PoolEntry(...)
            E->>SRV: Transport verbinden
            SRV-->>E: bereit
            E-->>P: verbunden
        end
    end
    P->>P: sessionToEntries.add(sessionId, id)
    P-->>S: PooledConnection

    Note over S,P: Sitzung nutzt Eintrag, dann…

    S->>P: release(id, sessionId)
    P->>E: Sitzung trennen
    E->>E: Drain-Timer starten (Standard 30s)
    Note over E: refs==0 → Drain-Timer feuert → Transport schließen<br/>(MAX_IDLE_MS 5min harte Obergrenze überlebt Anhängen/Trennen)

    Note over S,P: Operator-Neustart-Ablauf…
    S->>P: restartByName(name, opts?)
    P->>E: drain + close
    P->>E: Ersatz erstellen
    E->>SRV: Neu verbinden
    P->>EB: publish mcp_server_restarted<br/>mit stabilem entryIndex
    P-->>S: Einzelergebnis oder {entries: RestartResult[]}
```
`releaseSession(sessionId)` verwendet den umgekehrten Index `sessionToEntries`, um jeden von der Session gehaltenen Eintrag in O(refs) freizugeben. Beim Herunterfahren des Daemons setzt `drainAll()` das `draining`-Flag (verweigert neue Akquisitionen) und wartet darauf, dass jeder Eintrag innerhalb eines konfigurierbaren Timeouts geschlossen wird.

## Workflow 5: Lebenszyklus – Start und Graceful Shutdown

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

Der zweiphasige Shutdown ist wichtig, da laufende HTTP-Anfragen, laufende SSE-Abonnenten und die laufenden Tool-Aufrufe des ACP-Kindprozesses begrenzte Herunterfahrfenster benötigen. Falls etwas diese Fristen überschreitet, übernimmt der erzwungene Schließpfad, sodass ein blockierter Kindprozess den Daemon-Prozess nicht am Leben halten kann.

## Critical files

| Bereich              | Datei                                                        |
| -------------------- | ----------------------------------------------------------- |
| Bootstrap            | `packages/cli/src/serve/run-qwen-serve.ts`                    |
| Express app          | `packages/cli/src/serve/server.ts`                          |
| Capability registry  | `packages/cli/src/serve/capabilities.ts`                    |
| Auth middleware      | `packages/cli/src/serve/auth.ts`                            |
| Bridge               | `packages/acp-bridge/src/bridge.ts`                         |
| BridgeClient         | `packages/acp-bridge/src/bridgeClient.ts`                   |
| Permission mediator  | `packages/acp-bridge/src/permissionMediator.ts`             |
| EventBus             | `packages/acp-bridge/src/eventBus.ts`                       |
| MCP transport pool   | `packages/core/src/tools/mcp-transport-pool.ts`             |
| Workspace MCP budget | `packages/core/src/tools/mcp-workspace-budget.ts`           |
| Workspace FS         | `packages/cli/src/serve/fs/`                                |
| SDK DaemonClient     | `packages/sdk-typescript/src/daemon/DaemonClient.ts`        |
| SDK SessionClient    | `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts` |
| Event schema         | `packages/sdk-typescript/src/daemon/events.ts`              |

## References

- Design issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803) (daemon design), [#4175](https://github.com/QwenLM/qwen-code/issues/4175) (F-series milestones).
- User guide: [`../../users/qwen-serve.md`](../../users/qwen-serve.md).
- Wire protocol reference: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md).
- F2 design document: [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md).
- F2 design notes: issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) commits 4-6.
