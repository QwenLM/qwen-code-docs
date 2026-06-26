# Arquitetura do Daemon

## Visão Geral

Um processo `qwen serve` é **um daemon = um workspace**. Ele hospeda um único servidor HTTP Express, possui uma instância `@qwen-code/acp-bridge` e gera um processo filho ACP (`qwen --acp`) que executa o runtime do agente propriamente dito. Vários clientes (CLI TUI, companion de IDE, bots de canal de mensagens, BFFs web, scripts customizados) conectam-se via HTTP + SSE e compartilham uma sessão ACP (`sessionScope: 'single'`, padrão) ou dividem sessões por thread de conversa (`sessionScope: 'thread'`).

Dentro do processo filho ACP, os servidores MCP são compartilhados em todo o workspace através do `McpTransportPool` (F2): uma única tupla (nome do servidor + fingerprint de configuração) mapeia para um único transporte MCP, independentemente de quantas sessões o descobrem. O `MultiClientPermissionMediator` (F3) da bridge coordena os votos de permissão entre todos os clientes conectados sob uma das quatro políticas.

Este documento fornece a **visão sistêmica** sobre a qual o restante deste conjunto de documentação se baseia. Cada fluxo crítico é mostrado como um diagrama de sequência Mermaid; os detalhes de implementação por componente estão nos outros 18 documentos.

## Topologia de processos

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

O processo daemon e o processo filho ACP são conectados por um `AcpChannel` (padrão: um par real de pipes stdio de subprocesso; `inMemoryChannel` para testes). Tudo o que o daemon faz é moldado por essa divisão: o tráfego HTTP e SSE termina no daemon, as decisões do agente e invocações de ferramentas ocorrem no filho, e a bridge conecta os dois.

## Mapa de pacotes

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

Três fronteiras de confiança são importantes: a borda HTTP (cadeia de middlewares `serve/auth.ts`), a fronteira bridge-processo-filho ACP (NDJSON sobre stdio, sem autenticação; o filho confia implicitamente na bridge) e a fronteira agente-servidor MCP (o agente pode invocar ferramentas que tocam o host).
## Fluxo de trabalho 1: Ciclo de vida da solicitação HTTP

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

Rotas não-streaming (prompt, cancelar, troca de modelo, metadados, CRUD de workspace) terminam como uma única resposta JSON. A saída de streaming é entregue fora da banda no canal SSE, **não** como um corpo HTTP fragmentado nesta conexão. Veja o fluxo de trabalho 2.

## Fluxo de trabalho 2: Entrega e reprodução de eventos SSE

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

O buffer circular é limitado (`eventRingSize`, padrão 8000). Um cliente reconectando cujo `Last-Event-ID` é mais antigo que o início do buffer recebe um sinal sintético de atualização e deve chamar `loadSession` / `resumeSession` para reconstruir o estado mais profundo. Clientes lentos disparam `slow_client_warning` a 75% da fila e `client_evicted` no limite.

## Fluxo de trabalho 3: Mediação de permissão multi-cliente

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

Mecanismo de escape entre políticas: qualquer cliente pode votar `CANCEL_VOTE_SENTINEL` para interromper a solicitação como `cancelled / agent_cancelled`. A bridge protege contra chamadores de rede que tentam passar o sentinela através do campo normal `optionId` (`InvalidPermissionOptionError`).

## Fluxo de trabalho 4: Aquisição/liberação/reinicialização do pool de transporte MCP

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
`releaseSession(sessionId)` usa o índice reverso `sessionToEntries` para liberar cada entrada que a sessão mantém em O(refs). No desligamento do daemon, `drainAll()` define a flag `draining` (recusando novas aquisições) e aguarda que cada entrada seja fechada dentro de um tempo limite configurável.

## Fluxo de Trabalho 5: Ciclo de Vida — inicialização e desligamento gracioso

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

O desligamento em duas fases é importante porque requisições HTTP em andamento, assinantes SSE em andamento e chamadas de ferramenta em andamento do processo filho ACP precisam de janelas de desligamento limitadas. Se algo bloquear além desses prazos, o caminho de fechamento forçado assume o controle para que um filho travado não mantenha o processo daemon vivo.

## Arquivos críticos

| Assunto              | Arquivo                                                        |
| -------------------- | -------------------------------------------------------------- |
| Inicialização        | `packages/cli/src/serve/run-qwen-serve.ts`                     |
| Aplicação Express    | `packages/cli/src/serve/server.ts`                             |
| Registro de capacidades | `packages/cli/src/serve/capabilities.ts`                    |
| Middleware de autenticação | `packages/cli/src/serve/auth.ts`                         |
| Bridge               | `packages/acp-bridge/src/bridge.ts`                            |
| BridgeClient         | `packages/acp-bridge/src/bridgeClient.ts`                      |
| Mediador de permissões | `packages/acp-bridge/src/permissionMediator.ts`             |
| EventBus             | `packages/acp-bridge/src/eventBus.ts`                          |
| Pool de transporte MCP | `packages/core/src/tools/mcp-transport-pool.ts`              |
| Orçamento MCP do workspace | `packages/core/src/tools/mcp-workspace-budget.ts`          |
| Sistema de arquivos do workspace | `packages/cli/src/serve/fs/`                        |
| SDK DaemonClient     | `packages/sdk-typescript/src/daemon/DaemonClient.ts`           |
| SDK SessionClient    | `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`   |
| Esquema de eventos   | `packages/sdk-typescript/src/daemon/events.ts`                 |

## Referências

- Issues de design: [#3803](https://github.com/QwenLM/qwen-code/issues/3803) (design do daemon), [#4175](https://github.com/QwenLM/qwen-code/issues/4175) (marcos da série F).
- Guia do usuário: [`../../users/qwen-serve.md`](../../users/qwen-serve.md).
- Referência do protocolo de comunicação: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md).
- Documento de design do F2: [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md).
- Notas de design do F2: issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) commits 4-6.
