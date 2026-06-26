# Arquitetura do Daemon

## Visão Geral

Um processo `qwen serve` é **um daemon = um workspace**. Ele hospeda um único servidor HTTP Express, possui uma instância de `@qwen-code/acp-bridge`, e inicia um processo filho ACP (`qwen --acp`) que executa o runtime do agente propriamente dito. Múltiplos clientes (CLI TUI, companion de IDE, bots de canais de IM, web BFFs, scripts customizados) se conectam via HTTP + SSE e ou compartilham uma única sessão ACP (`sessionScope: 'single'`, padrão) ou dividem sessões por thread de conversa (`sessionScope: 'thread'`).

Dentro do processo filho ACP, os servidores MCP são compartilhados em todo o workspace através do `McpTransportPool` (F2): uma única tupla (nome-do-servidor + fingerprint-de-config) mapeia para um único transporte MCP, independentemente de quantas sessões o descubram. O `MultiClientPermissionMediator` (F3) da bridge coordena votos de permissão entre todos os clientes conectados sob uma de quatro políticas.

Este documento fornece a **visão sistêmica** sobre a qual o restante deste conjunto de documentação se baseia. Cada fluxo crítico é mostrado como um diagrama de sequência Mermaid; detalhes de implementação por componente residem nos outros 18 documentos.

## Topologia de processos

```mermaid
flowchart LR
    subgraph clients["Clientes"]
        WUI["Web UI<br/>(packages/webui/src/daemon)"]
        TUI["CLI TUI<br/>(packages/cli/src/ui/daemon)"]
        IDE["VS Code IDE<br/>(packages/vscode-ide-companion)"]
        CH["Bots de canal<br/>(DingTalk / WeChat / Telegram / Feishu)"]
        SDK["Qualquer consumidor SDK<br/>(packages/sdk-typescript/src/daemon)"]
    end

    subgraph daemon["Processo qwen serve (um workspace)"]
        EXP["App Express<br/>(packages/cli/src/serve/server.ts)"]
        BR["AcpBridge<br/>(packages/acp-bridge/src/bridge.ts)"]
        MED["MultiClientPermissionMediator<br/>(F3)"]
        EB["EventBus por sessão<br/>(eventBus.ts)"]
        FS["WorkspaceFileSystem<br/>(cli/src/serve/fs/)"]
    end

    subgraph child["Processo filho ACP (qwen --acp)"]
        AGT["Runtime QwenAgent"]
        POOL["McpTransportPool<br/>(F2, core/src/tools)"]
        BDG["WorkspaceMcpBudget"]
    end

    subgraph external["Externo"]
        MCP1["Servidor MCP A<br/>(stdio)"]
        MCP2["Servidor MCP B<br/>(websocket)"]
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

    BR -- "ACP NDJSON via stdio" --> AGT
    AGT --> POOL
    POOL --> BDG
    POOL -- "transporte compartilhado" --> MCP1
    POOL -- "transporte compartilhado" --> MCP2
```

O processo daemon e o processo filho ACP são conectados por um `AcpChannel` (padrão: um par real de pipes stdio de subprocesso; `inMemoryChannel` para testes). Tudo o que o daemon faz é moldado por essa divisão: o tráfego HTTP e SSE termina no daemon, as decisões do agente e as invocações de ferramentas ocorrem no filho, e a bridge conecta os dois.

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

    subgraph adapters["Adaptadores"]
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

Três fronteiras de confiança são importantes: a borda HTTP (cadeia de middleware `serve/auth.ts`), a fronteira bridge-para-filho-ACP (NDJSON via stdio, sem autenticação; o filho confia implicitamente na bridge), e a fronteira agente-para-servidor-MCP (o agente pode invocar ferramentas que tocam o host).

## Workflow 1: Ciclo de vida de requisição HTTP

```mermaid
sequenceDiagram
    autonumber
    participant C as Cliente (SDK)
    participant MW as Middleware<br/>(CORS→host→log→bearer→rate-limit→JSON→telemetry→mutationGate)
    participant R as Handler de rota
    participant BR as AcpBridge
    participant BC as BridgeClient
    participant CH as Filho ACP

    C->>MW: POST /session/:id/prompt<br/>Authorization: Bearer …<br/>X-Qwen-Client-Id: …
    MW->>MW: denyBrowserOriginCors
    MW->>MW: hostAllowlist (proteção contra DNS rebinding)
    MW->>MW: hook de access-log
    MW->>MW: bearerAuth (comparação em tempo constante)
    MW->>MW: rateLimit (quando habilitado)
    MW->>MW: express.json body parser
    MW->>MW: daemonTelemetryMiddleware
    MW->>MW: mutationGate (rígido em rotas de mutação)
    MW->>R: req validada
    R->>BR: bridge.sendPrompt(sessionId, body, clientId)
    BR->>BC: client.sendPrompt(sessionId, …)
    BC->>CH: ACP JSON-RPC via stdin
    CH-->>BC: Resposta / notificações ACP
    BC-->>BR: resultado
    BR-->>R: resultado
    R-->>C: 200 JSON
```

Rotas não-streaming (prompt, cancelar, troca de modelo, metadados, CRUD de workspace) terminam como uma única resposta JSON. A saída streaming é entregue fora-de-banda no canal SSE, **não** como um corpo HTTP chunked nesta conexão. Veja o workflow 2.

## Workflow 2: Entrega e replay de eventos SSE

```mermaid
sequenceDiagram
    autonumber
    participant C as Cliente
    participant SR as GET /session/:id/events
    participant EB as EventBus<br/>(por sessão)
    participant BC as BridgeClient
    participant CH as Filho ACP

    C->>SR: GET …/events<br/>Last-Event-ID: 42 (opcional)
    SR->>EB: subscribe(lastSeenId=42, maxQueued=N)
    EB-->>SR: replay frames 43..currentTail<br/>(do ring buffer)
    SR-->>C: NDJSON: id=43, type=session_update, …
    CH-->>BC: Notificação ACP (ex.: agent_message_chunk)
    BC->>EB: publish({type, data})
    EB-->>SR: enfileirar id=N
    SR-->>C: id=N, type=…, data=…
    Note over EB,SR: Se a fila do assinante >= maxQueued,<br/>o EventBus emite o frame terminal client_evicted<br/>e fecha o assinante.
```

O ring buffer é limitado (`eventRingSize`, padrão 8000). Um cliente reconectando cujo `Last-Event-ID` é mais antigo que o início do ring buffer recebe um sinal sintético de catch-up e deve chamar `loadSession` / `resumeSession` para reconstruir o estado mais profundo. Clientes lentos disparam `slow_client_warning` a 75% de preenchimento da fila e `client_evicted` no limite máximo.

## Workflow 3: Mediação de permissão multi-cliente

```mermaid
sequenceDiagram
    autonumber
    participant CH as Filho ACP (agente)
    participant BC as BridgeClient.requestPermission
    participant MED as Mediator (política)
    participant EB as EventBus
    participant C1 as Cliente A<br/>(originador)
    participant C2 as Cliente B

    CH->>BC: ACP requestPermission(requestId, options)
    BC->>MED: request({requestId, sessionId, originatorClientId, allowedOptionIds}, timeoutMs)
    MED->>EB: publish permission_request<br/>(broadcast para assinantes)
    EB-->>C1: SSE permission_request
    EB-->>C2: SSE permission_request

    alt first-responder
        C2->>MED: POST /permission/:requestId optionId=allow
        MED-->>BC: resolvido
        BC-->>CH: Resposta ACP
        MED->>EB: permission_resolved
        C1->>MED: POST /permission/:requestId (voto tardio)
        MED-->>C1: 409 permission_already_resolved
    else designated
        C2->>MED: voto (clientId != originatorClientId)
        MED-->>C2: 403 permission_forbidden
        C1->>MED: voto (corresponde ao originador)
        MED-->>BC: resolvido
    else consenso (N-de-M)
        C1->>MED: voto
        MED->>EB: permission_partial_vote (1/N)
        C2->>MED: voto
        MED->>EB: permission_partial_vote (2/N)
        Note over MED: quando a contagem atinge o quórum em uma opção, resolve
    else local-only
        C2->>MED: voto (remoto)
        MED-->>C2: 403 permission_forbidden (remote_not_allowed)
        Note over MED,CH: bloqueia até que um votante de loopback resolva
    end
```

Escapatória cross-política: qualquer cliente pode votar `CANCEL_VOTE_SENTINEL` para interromper a requisição como `cancelled / agent_cancelled`. A bridge protege contra chamadores externos que tentem enviar o sentinela através do campo `optionId` normal (`InvalidPermissionOptionError`).

## Workflow 4: Acquire / release / restart do pool de transporte MCP

```mermaid
sequenceDiagram
    autonumber
    participant S as Sessão no filho ACP
    participant P as McpTransportPool
    participant SIF as spawnInFlight (dedup)
    participant E as PoolEntry
    participant BDG as WorkspaceMcpBudget
    participant SRV as Servidor MCP

    S->>P: acquire(name, cfg, sessionId)
    P->>SIF: verificar inflight para (name+fingerprint)
    alt cached inflight
        SIF-->>P: promise existente
    else cold start
        P->>BDG: tryReserve(name)
        BDG-->>P: ok / recusado
        alt recusado
            P-->>S: BudgetExhaustedError
        else ok
            P->>E: new PoolEntry(...)
            E->>SRV: conectar transporte
            SRV-->>E: pronto
            E-->>P: conectado
        end
    end
    P->>P: sessionToEntries.add(sessionId, id)
    P-->>S: PooledConnection

    Note over S,P: Sessão usa a entrada, então…

    S->>P: release(id, sessionId)
    P->>E: desconectar sessão
    E->>E: armar timer de drenagem (padrão 30s)
    Note over E: refs==0 → timer de drenagem dispara → fechar transporte<br/>(MAX_IDLE_MS de 5min rígido sobrevive a oscilações attach/detach)

    Note over S,P: Fluxo de reinicialização do operador…
    S->>P: restartByName(name, opts?)
    P->>E: drenar + fechar
    P->>E: iniciar substituto
    E->>SRV: reconectar
    P->>EB: publicar mcp_server_restarted<br/>com entryIndex estável
    P-->>S: resultado único ou {entries: RestartResult[]}
```

`releaseSession(sessionId)` usa o índice reverso `sessionToEntries` para liberar cada entrada que a sessão possui em O(refs). No desligamento do daemon, `drainAll()` define a flag `draining` (recusando novos acquires) e aguarda que cada entrada feche dentro de um timeout configurável.

## Workflow 5: Ciclo de vida — inicialização e desligamento gracioso

```mermaid
sequenceDiagram
    autonumber
    participant Op as Operador (sinal)
    participant RQS as runQwenServe
    participant APP as App Express
    participant BR as AcpBridge
    participant CH as Filho ACP

    Op->>RQS: qwen serve --workspace … --token …
    RQS->>RQS: validar flags + canonicalizar workspace
    RQS->>RQS: alocar PermissionAuditRing
    RQS->>BR: createHttpAcpBridge(options)
    RQS->>APP: createServeApp(bridge, …)
    RQS->>APP: listen(host, port)
    RQS->>RQS: armar handlers SIGINT / SIGTERM

    Op->>RQS: SIGTERM
    RQS->>BR: liberar registro device-flow
    RQS->>BR: bridge.shutdown()
    BR->>CH: enviar graceful close (prazo de 10s)
    CH-->>BR: sair
    RQS->>APP: server.close() (timer de force-close de 5s)
    APP->>APP: closeAllConnections() (+2s secundário)
    Note over Op,RQS: Segundo SIGTERM durante desligamento →<br/>bridge.killAllSync() + process.exit(1) (prevenção de órfãos)
```

O desligamento em duas fases é importante porque requisições HTTP em andamento, assinantes SSE em andamento e chamadas de ferramentas em andamento do filho ACP precisam de janelas de desligamento limitadas. Se algo bloquear além desses prazos, o caminho de force-close assume o controle para que um filho travado não mantenha o processo daemon vivo.

## Arquivos críticos

| Interesse              | Arquivo                                                      |
| ---------------------- | ------------------------------------------------------------ |
| Bootstrap              | `packages/cli/src/serve/run-qwen-serve.ts`                     |
| App Express            | `packages/cli/src/serve/server.ts`                           |
| Registro de capacidades| `packages/cli/src/serve/capabilities.ts`                     |
| Middleware de auth     | `packages/cli/src/serve/auth.ts`                             |
| Bridge                 | `packages/acp-bridge/src/bridge.ts`                          |
| BridgeClient           | `packages/acp-bridge/src/bridgeClient.ts`                    |
| Mediator de permissão  | `packages/acp-bridge/src/permissionMediator.ts`              |
| EventBus               | `packages/acp-bridge/src/eventBus.ts`                        |
| Pool de transporte MCP | `packages/core/src/tools/mcp-transport-pool.ts`              |
| Orçamento MCP do workspace | `packages/core/src/tools/mcp-workspace-budget.ts`          |
| FS do workspace        | `packages/cli/src/serve/fs/`                                 |
| SDK DaemonClient       | `packages/sdk-typescript/src/daemon/DaemonClient.ts`         |
| SDK SessionClient      | `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`  |
| Schema de eventos      | `packages/sdk-typescript/src/daemon/events.ts`               |

## Referências

- Issues de design: [#3803](https://github.com/QwenLM/qwen-code/issues/3803) (design do daemon), [#4175](https://github.com/QwenLM/qwen-code/issues/4175) (marcos da série F).
- Guia do usuário: [`../../users/qwen-serve.md`](../../users/qwen-serve.md).
- Referência do protocolo wire: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md).
- Documento de design F2: [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md).
- Notas de design F2: issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) commits 4-6.