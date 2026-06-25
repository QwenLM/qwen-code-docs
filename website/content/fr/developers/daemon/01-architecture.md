# Architecture du démon

## Vue d'ensemble

Un processus `qwen serve` correspond à **un démon = un espace de travail**. Il héberge un seul serveur HTTP Express, possède une instance `@qwen-code/acp-bridge`, et lance un processus enfant ACP (`qwen --acp`) qui exécute le véritable environnement d'exécution de l'agent. Plusieurs clients (TUI CLI, compagnon IDE, robots de canaux de messagerie, BFFs web, scripts personnalisés) se connectent via HTTP + SSE et soit partagent une session ACP (`sessionScope: 'single'`, par défaut), soit répartissent les sessions par fil de discussion (`sessionScope: 'thread'`).

À l'intérieur de l'enfant ACP, les serveurs MCP sont partagés à l'échelle de l'espace de travail via `McpTransportPool` (F2) : un seul tuple (nom du serveur + empreinte de configuration) correspond à un transport MCP, quel que soit le nombre de sessions qui le découvrent. Le `MultiClientPermissionMediator` (F3) du pont coordonne les votes d'autorisation parmi tous les clients connectés selon l'une des quatre politiques.

Ce document donne la **vue d'ensemble au niveau système** sur laquelle repose le reste de cette documentation. Chaque flux critique est représenté sous forme de diagramme de séquence Mermaid ; les détails d'implémentation par composant se trouvent dans les 18 autres documents.

## Topologie des processus

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

Le processus démon et l'enfant ACP sont connectés par un `AcpChannel` (par défaut : une paire de tubes stdio réels de sous-processus ; `inMemoryChannel` pour les tests). Tout ce que fait le démon est façonné par cette séparation : le trafic HTTP et SSE se termine dans le démon, les décisions de l'agent et les invocations d'outils se produisent dans l'enfant, et le pont relie les deux.

## Carte des paquets

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

Trois limites de confiance sont importantes : la frontière HTTP (chaîne de middleware `serve/auth.ts`), la frontière pont-enfant ACP (NDJSON sur stdio, sans authentification ; l'enfant fait implicitement confiance au pont), et la frontière agent-serveur MCP (l'agent peut invoquer des outils qui touchent l'hôte).
## Workflow 1 : Cycle de vie d'une requête HTTP

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

Les routes non-streaming (prompt, annulation, changement de modèle, métadonnées, CRUD d'espace de travail) se terminent par une réponse JSON unique. La sortie en streaming est délivrée hors bande sur le canal SSE, **pas** comme un corps HTTP fragmenté sur cette connexion. Voir le workflow 2.

## Workflow 2 : Distribution et relecture des événements SSE

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

Le tampon circulaire est limité (`eventRingSize`, par défaut 8000). Un client qui se reconnecte avec un `Last-Event-ID` plus ancien que la tête du tampon reçoit un signal de rattrapage synthétique et doit appeler `loadSession` / `resumeSession` pour reconstruire un état plus profond. Les clients lents déclenchent `slow_client_warning` à 75% de remplissage de la file et `client_evicted` à la limite.

## Workflow 3 : Médiation des permissions multi-client

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

Trappe de secours inter-politique : tout client peut voter `CANCEL_VOTE_SENTINEL` pour court-circuiter la requête en tant que `cancelled / agent_cancelled`. Le pont se protège contre les appelants réseau qui feraient passer le sentinelle via le champ normal `optionId` (`InvalidPermissionOptionError`).

## Workflow 4 : Acquisition / libération / redémarrage du pool de transport MCP

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
`releaseSession(sessionId)` utilise l'index inverse `sessionToEntries` pour libérer chaque entrée que la session détient en O(refs). À l'arrêt du daemon, `drainAll()` positionne le drapeau `draining` (refusant toute nouvelle acquisition) et attend la fermeture de chaque entrée dans un délai configurable.

## Workflow 5 : Cycle de vie — démarrage et arrêt gracieux

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

L'arrêt en deux phases est important car les requêtes HTTP en cours, les abonnés SSE en cours et les appels d'outils en cours du processus ACP ont tous besoin de fenêtres d'arrêt limitées. Si quelque chose bloque au-delà de ces délais, le chemin de fermeture forcée prend le relais afin qu'un processus enfant bloqué ne puisse pas maintenir le processus du daemon en vie.

## Fichiers critiques

| Domaine              | Fichier                                                     |
| -------------------- | ----------------------------------------------------------- |
| Bootstrap            | `packages/cli/src/serve/run-qwen-serve.ts`                    |
| Application Express  | `packages/cli/src/serve/server.ts`                          |
| Registre de capacités| `packages/cli/src/serve/capabilities.ts`                    |
| Middleware d'authentification | `packages/cli/src/serve/auth.ts`                     |
| Pont                 | `packages/acp-bridge/src/bridge.ts`                         |
| BridgeClient         | `packages/acp-bridge/src/bridgeClient.ts`                   |
| Médiateur d'autorisation | `packages/acp-bridge/src/permissionMediator.ts`          |
| EventBus             | `packages/acp-bridge/src/eventBus.ts`                       |
| Pool de transports MCP | `packages/core/src/tools/mcp-transport-pool.ts`           |
| Budget MCP de l'espace de travail | `packages/core/src/tools/mcp-workspace-budget.ts`   |
| FS de l'espace de travail | `packages/cli/src/serve/fs/`                             |
| DaemonClient SDK     | `packages/sdk-typescript/src/daemon/DaemonClient.ts`        |
| SessionClient SDK    | `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts` |
| Schéma d'événements  | `packages/sdk-typescript/src/daemon/events.ts`              |

## Références

- Problèmes de conception : [#3803](https://github.com/QwenLM/qwen-code/issues/3803) (conception du daemon), [#4175](https://github.com/QwenLM/qwen-code/issues/4175) (jalons de la série F).
- Guide utilisateur : [`../../users/qwen-serve.md`](../../users/qwen-serve.md).
- Référence du protocole filaire : [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md).
- Document de conception F2 : [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md).
- Notes de conception F2 : issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) commits 4-6.
