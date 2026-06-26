# ACP Bridge

## Visão Geral

`packages/acp-bridge/` gerencia a fronteira entre a camada HTTP do daemon e o processo filho ACP. É consumido por `packages/cli/src/serve/` (o daemon `qwen serve`) e foi extraído no #4175 F1 passo 3 para que futuros consumidores (`channels/base/AcpBridge.ts`, o companheiro de IDE VS Code) possam usar o mesmo núcleo da ponte sem acessar o pacote CLI.

A ponte fornece uma instância `HttpAcpBridge`, um `AcpChannel` para o filho ACP, sessões multiplexadas sobre esse canal, `EventBus`es por sessão, um `MultiClientPermissionMediator`, um adaptador `BridgeFileSystem` e ajudantes orientados ao ACP (`spawnOrAttach`, `loadSession`, `resumeSession`, `sendPrompt`, `cancelSession`, `respondToPermission`, além de RPCs extMethod para status do workspace e reinício do MCP).

## Responsabilidades

- Iniciar ou anexar ao filho ACP via uma `ChannelFactory` plugável. Fábrica padrão: `defaultSpawnChannelFactory` (subprocesso `qwen --acp`). Testes injetam `inMemoryChannel`.
- Manter `aliveChannels` (registro de canais) e `byId` (registro de sessões).
- Multiplexar N sessões do lado HTTP em um filho ACP via `connection.newSession()`.
- Serializar prompts por sessão através de `promptQueue` (ACP impõe um prompt ativo por sessão).
- FIFO por sessão para chamadas `setSessionModel` para que anexos concorrentes com modelos diferentes não disputem o agente.
- `EventBus` por sessão que alimenta `GET /session/:id/events` (veja [`10-event-bus.md`](./10-event-bus.md)).
- Fluxo de permissão: `BridgeClient.requestPermission` → `MultiClientPermissionMediator.request` → dispersão → coleta de votos → resposta ACP (veja [`04-permission-mediation.md`](./04-permission-mediation.md)).
- E/S de arquivo: adaptador `BridgeFileSystem` para chamadas ACP `readTextFile` / `writeTextFile` (veja [`07-workspace-filesystem.md`](./07-workspace-filesystem.md)).
- RPCs extMethod para status do workspace (`/workspace/mcp`, `/workspace/skills`, `/workspace/providers`) e reinício do MCP.
- Ciclo de vida: `shutdown()` graciosa com `KILL_HARD_DEADLINE_MS` (10s) por canal; `killAllSync()` síncrona para saída forçada em segundo sinal.

## Arquitetura

**Entrada pública**: `createHttpAcpBridge(opts: BridgeOptions): HttpAcpBridge` em `packages/acp-bridge/src/bridge.ts`.

**Tipos principais**:

| Tipo                            | Arquivo                  | Função                                                                                                                                                                                                                  |
| ------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HttpAcpBridge`                 | `bridgeTypes.ts`        | Interface pública: `spawnOrAttach`, `loadSession`, `resumeSession`, `sendPrompt`, `cancelSession`, `subscribeEvents`, `respondToPermission`, `getWorkspaceMcpStatus`, `restartMcpServer`, `shutdown`, `killAllSync`, … |
| `BridgeSession`                 | `bridgeTypes.ts`        | `{ sessionId, workspaceCwd, attached, clientId?, createdAt? }` retornado aos manipuladores HTTP.                                                                                                                             |
| `BridgeOptions`                 | `bridgeOptions.ts`      | Configuração em tempo de construção (veja [Configuração](#configuration)).                                                                                                                                                       |
| `AcpChannel`                    | `channel.ts`            | `{ stream, kill(), killSync(), exited }` — um canal ACP NDJSON.                                                                                                                                                    |
| `ChannelFactory`                | `channel.ts`            | `(workspaceCwd, childEnvOverrides?) => Promise<AcpChannel>`.                                                                                                                                                          |
| `BridgeClient`                  | `bridgeClient.ts`       | Encapsula uma `ClientSideConnection` ACP; implementa `Client` ACP (`requestPermission`, `readTextFile`, `writeTextFile`, `sessionUpdate`, `extNotification`).                                                             |
| `EventBus`                      | `eventBus.ts`           | Pub/sub em memória por sessão. Veja [`10-event-bus.md`](./10-event-bus.md).                                                                                                                                            |
| `MultiClientPermissionMediator` | `permissionMediator.ts` | Mediador de quatro políticas. Veja [`04-permission-mediation.md`](./04-permission-mediation.md).                                                                                                                               |
**Estado interno (fechado por `createHttpAcpBridge`)**:

| Estado                  | Forma                            | Propósito                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `aliveChannels`          | `Map<string, ChannelInfo>`       | Registro de canais, indexado pelo id do canal. Cada `ChannelInfo` contém `channel`, `connection`, `client` (um `BridgeClient` por canal), `sessionIds: Set<string>`, `pendingRestoreIds`, `statusClosedReject?`, `isDying: boolean`.                                                                                                                                                                                            |
| `byId`                   | `Map<string, SessionEntry>`      | Registro de sessões, indexado por sessionId. Cada `SessionEntry` contém `channel`, `connection`, `events: EventBus`, `promptQueue: Promise<void>`, `modelChangeQueue: Promise<void>`, `pendingPermissionIds: Set<string>`, `clientIds: Map<string, count>`, `activePromptOriginatorClientId?`, `attachCount`, `spawnOwnerWantedKill`, `restoreState?`, `sessionLastSeenAt?`, `clientLastSeenAt: Map<string, ms>`.                 |
| `defaultEntry`           | `SessionEntry \| null`            | A sessão "única" usada quando `sessionScope: 'single'`.                                                                                                                                                                                                                                                                                                                                                                        |
| `defaultPolicy`          | `PermissionPolicy`                | Configurada via `BridgeOptions.permissionPolicy`.                                                                                                                                                                                                                                                                                                                                                                              |
| `mediator`               | `MultiClientPermissionMediator`   | Um por instância do bridge.                                                                                                                                                                                                                                                                                                                                                                                                    |
| Constantes               | —                                | `DEFAULT_INIT_TIMEOUT_MS = 10_000`, `MCP_RESTART_TIMEOUT_MS = 300_000`, `DEFAULT_MAX_SESSIONS = 20`, `MAX_EVENT_RING_SIZE = 1_000_000`, `DEFAULT_PERMISSION_TIMEOUT_MS = 5min`, `DEFAULT_MAX_PENDING_PER_SESSION = 64`.                                                                                                                                                                                                         |

**Invariante `isDying`**: qualquer caminho de desmontagem deve definir `ChannelInfo.isDying = true` de forma síncrona **antes** de aguardar `channel.kill()`. `ensureChannel` trata um canal moribundo como ausente e cria um novo. Sem essa flag, um `spawnOrAttach` concorrente que chegue durante a janela de grace do SIGTERM (até 10s) se anexaria a um transporte prestes a fechar e o sessionId do chamador retornaria 404 em toda requisição subsequente. **Locais de definição** (devem permanecer em sincronia): `ensureChannel` (falha na inicialização + rechecagem de desligamento tardio), `doSpawn` (falha de nova sessão em canal vazio), `killSession` (última sessão saindo), `shutdown` (em lote).

**Invariante de retenção de `channelInfo`**: **não** limpe `channelInfo` ao definir `isDying = true`. `killAllSync` ainda deve encontrar o canal durante a janela de grace do SIGTERM para disparar SIGKILL em `process.exit(1)`. `aliveChannels` mantém a entrada moribunda até que `channel.exited` seja disparado.

**Buffer limitado do BridgeClient**: Frames `extNotification` do ACP que chegam no `BridgeClient` para um sessionId ainda não presente em `byId` (porque a resposta de `connection.newSession` ainda não retornou, mas a descoberta MCP dentro de `newSession` já disparou eventos de orçamento) são armazenados em buffer em uma fila de eventos antecipados limitada por `MAX_EARLY_EVENT_SESSIONS = 64` × `MAX_EARLY_EVENTS_PER_SESSION = 32` × `EARLY_EVENT_TTL_MS = 60_000`. O pior caso é aproximadamente 400 KB de heap. Sem o buffer, o primeiro slot do ring de replay SSE para uma nova sessão perderia eventos que ocorreram durante sua criação.
## Fluxo de Trabalho

### `spawnOrAttach` (ponto de entrada principal)

```mermaid
sequenceDiagram
    autonumber
    participant R as Route handler
    participant B as createHttpAcpBridge closure
    participant CF as ChannelFactory
    participant CH as AcpChannel
    participant ACP as ACP child
    participant M as Mediator

    R->>B: spawnOrAttach({cwd?, sessionScope?, clientId?})
    B->>B: validate cwd vs boundWorkspace<br/>(WorkspaceMismatchError)
    alt sessionScope=single and defaultEntry exists
        B->>B: bump attachCount<br/>register clientId
        B-->>R: {sessionId, attached: true, restoreState?}
    else cold path
        B->>CF: factory(workspaceCwd, childEnvOverrides)
        CF->>ACP: spawn qwen --acp + pipes
        CF-->>B: AcpChannel
        B->>ACP: ACP initialize (timeout=DEFAULT_INIT_TIMEOUT_MS)
        ACP-->>B: initialize response
        B->>ACP: connection.newSession({cwd})
        ACP-->>B: {sessionId}
        B->>B: build SessionEntry<br/>register in byId / defaultEntry
        B-->>R: {sessionId, attached: false}
    end
```

Pontos principais:

- `sessionScope='single'` com um `defaultEntry` existente apenas incrementa `attachCount`, registra `clientId` e retorna `attached: true`.
- O caminho frio executa a ChannelFactory, realiza a inicialização ACP (`DEFAULT_INIT_TIMEOUT_MS=10s`), chama `connection.newSession({cwd})` e então registra a nova `SessionEntry`.
- `SessionLimitExceededError` é lançado quando `byId.size >= maxSessions`.
- `InvalidClientIdError` é lançado se `X-Qwen-Client-Id` estiver fora de `[A-Za-z0-9._:-]{1,128}`.
- O coletor de desconexão (disconnect-reaper) em `server.ts` rastreia o dono da criação via `attachCount`/`spawnOwnerWantedKill` para evitar derrubar uma sessão cujo dono da criação desconectou, mas outros clientes já estão anexados (revisão #3889 BQ9tV).

### Serialização de prompt

```mermaid
sequenceDiagram
    autonumber
    participant R as Route
    participant E as SessionEntry
    participant Q as promptQueue (FIFO)
    participant BC as BridgeClient
    participant ACP as ACP child

    R->>E: sendPrompt(sessionId, body, clientId)
    E->>E: set activePromptOriginatorClientId = clientId
    E->>Q: chain off resolved tail
    Q->>BC: client.sendPrompt(sessionId, body)
    BC->>ACP: ACP prompt JSON-RPC
    ACP-->>BC: response (after potentially multiple requestPermission roundtrips)
    BC-->>E: result
    E->>E: clear activePromptOriginatorClientId
    E-->>R: result
```

Falhas na cauda da fila são **engolidas** para que a rejeição de um prompt anterior não contamine prompts subsequentes; o chamador original ainda recebe a rejeição em sua própria promessa retornada. A `transportClosedReject` armazenada em cache na sessão faz a promessa do prompt competir com `channel.exited` para que um filho que falhou apareça imediatamente, em vez de travar.

### Fluxo de permissão (visão geral)

```mermaid
sequenceDiagram
    autonumber
    participant ACP as ACP child (agent)
    participant BC as BridgeClient.requestPermission
    participant E as SessionEntry
    participant M as Mediator
    participant EB as EventBus

    ACP->>BC: requestPermission(requestId, options)
    BC->>E: record requestId in pendingPermissionIds
    BC->>M: request({requestId, sessionId, originatorClientId, allowedOptionIds}, timeoutMs)
    M->>EB: publish permission_request (fan-out to subscribers)
    Note over M: waits for vote / timeout / cancel
    M-->>BC: PermissionResolution
    BC-->>ACP: RequestPermissionResponse (selected or cancelled)
    BC->>E: clear requestId
```

`InvalidPermissionOptionError` é lançado antes do mediador quando um voto da rede tenta injetar `CANCEL_VOTE_SENTINEL` através do campo normal `optionId` — o sentinela é a única saída de emergência da bridge para encurtar uma requisição como `cancelled / agent_cancelled` e não deve ser acessível pela rede acidentalmente. Veja [`04-permission-mediation.md`](./04-permission-mediation.md).

### Desligamento

```mermaid
sequenceDiagram
    autonumber
    participant Op as runQwenServe
    participant B as Bridge
    participant CHs as Channels
    participant M as Mediator

    Op->>B: shutdown()
    B->>CHs: mark every ChannelInfo isDying = true (bulk)
    B->>M: forgetSession for every sessionId (pending → cancelled/session_closed)
    par per channel
        B->>CHs: channel.kill() (await up to KILL_HARD_DEADLINE_MS = 10s)
        CHs-->>B: exited
    end
    B-->>Op: done
    Note over Op,B: Second signal → killAllSync()<br/>(fire SIGKILL on every alive child synchronously)
```

## Fábrica de canais

`AcpChannel` (`channel.ts`) é a abstração de transporte da bridge. A produção usa `defaultSpawnChannelFactory` em `spawnChannel.ts`, que executa `qwen --acp` como um subprocesso com um par de pipes stdio. Testes injetam `inMemoryChannel` para executar o agente in-process. A bridge não sabe nada sobre o mecanismo subjacente — ela só precisa de `{ stream, kill, killSync, exited }`.

`ChannelFactory` aceita `childEnvOverrides` para que cada handle de daemon possa passar suas próprias variáveis de ambiente de orçamento MCP (`QWEN_SERVE_MCP_CLIENT_BUDGET`, `QWEN_SERVE_MCP_BUDGET_MODE`) sem modificar `process.env` (o que causaria concorrência quando dois daemons incorporados rodam no mesmo processo Node).
## Estado e Ciclo de Vida

- A construção da bridge é síncrona; o primeiro `spawnOrAttach` faz cold-start do filho do ACP.
- `defaultEntry` vive pelo tempo de vida da bridge sob `sessionScope: 'single'`; o canal é liberado quando `sessionIds.size === 0` (após `killSession`) E `isDying` se torna verdadeiro.
- `MAX_EVENT_RING_SIZE = 1_000_000` é um limite superior suave para `BridgeOptions.eventRingSize` para capturar erros de digitação do operador antes de OOMs de ~500 MB por sessão.
- `DEFAULT_PERMISSION_TIMEOUT_MS = 5 * 60 * 1000` evita que uma solicitação de permissão travada bloqueie o `promptQueue` por sessão para sempre.
- `DEFAULT_MAX_PENDING_PER_SESSION = 64` espelha `DEFAULT_MAX_SUBSCRIBERS`; chamadas `requestPermission` excedentes são resolvidas como canceladas com um aviso no stderr.

## Dependências

| Upstream                                                                                     | Downstream                                     |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `@agentclientprotocol/sdk` — `ClientSideConnection`, `PROTOCOL_VERSION`, tipos ACP            | `packages/cli/src/serve/` (o daemon)           |
| `@qwen-code/qwen-code-core` — `ApprovalMode`, `TrustGateError`, `getCurrentGeminiMdFilename`  | `packages/channels/base/` (planejado, F4)      |
| `node:crypto`, `node:fs`, `node:path`                                                         | `packages/vscode-ide-companion/` (planejado, F4) |

## Configuração

`BridgeOptions` (`bridgeOptions.ts`):

| Chave                                    | Padrão                                            | Propósito                                                                                      |
| ---------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `boundWorkspace`                         | (obrigatório)                                     | Caminho canônico do workspace que a bridge impõe.                                              |
| `sessionScope`                           | `'single'`                                        | `'single'` compartilha uma sessão entre todos os clientes; `'thread'` cria uma sessão separada para cada thread de conversa. |
| `channelFactory`                         | `defaultSpawnChannelFactory`                      | Fábrica plugável do filho do ACP.                                                              |
| `initializeTimeoutMs`                    | `DEFAULT_INIT_TIMEOUT_MS = 10_000`                | Timeout do handshake ACP `initialize`.                                                         |
| `maxSessions`                            | `DEFAULT_MAX_SESSIONS = 20`                       | Limite de `byId.size`. `0` / `Infinity` = ilimitado; NaN/negativo lança erro.                  |
| `eventRingSize`                          | `DEFAULT_RING_SIZE` (de `eventBus.ts`)            | Anel de eventos por sessão; limitado suavemente por `MAX_EVENT_RING_SIZE`.                     |
| `permissionResponseTimeoutMs`            | `DEFAULT_PERMISSION_TIMEOUT_MS = 5 min`           | Tempo real máximo por requisição para o mediador.                                              |
| `maxPendingPermissionsPerSession`        | `DEFAULT_MAX_PENDING_PER_SESSION = 64`            | Contrapressão para agentes de alto volume.                                                     |
| `childEnvOverrides`                      | `{}`                                              | Adições/remoções de env por handle para o filho do ACP.                                        |
| `persistApprovalMode`, `persistDisabledTools` | —                                                | Hooks de escrita de configuração para as rotas de mutação da Wave 4.                           |
| `contextFilename`                        | do `context.fileName` em `settings.json`          | Substitui `getCurrentGeminiMdFilename`.                                                        |
| `statusProvider`                         | (nenhum)                                          | Células de pré-voo hospedadas pelo daemon (`DaemonStatusProvider`).                            |
| `fileSystem`                             | (nenhum)                                          | Adaptador `BridgeFileSystem` para `readTextFile` / `writeTextFile` do ACP.                     |
| `permissionPolicy`                       | do `policy.permissionStrategy` em `settings.json` | Um de `first-responder` / `designated` / `consensus` / `local-only`.                           |
| `permissionConsensusQuorum`              | de `settings.json`                                | N para política de consenso.                                                                   |
| `permissionAudit`                        | `createNoOpPermissionAuditPublisher()`            | Conecta a `PermissionAuditRing` para a trilha de auditoria.                                    |
| `channelIdleTimeoutMs`                   | `0`                                               | Mantém o filho do ACP ativo por este número de milissegundos após o fechamento da última sessão. |
## Métodos adicionais de bridge

Além das chamadas principais `spawnOrAttach`, `sendPrompt`, `cancelSession`,
`respondToPermission`, `loadSession` e `resumeSession`, a interface
`HttpAcpBridge` agora inclui estes auxiliares voltados ao daemon:

| Método                                                        | Finalidade                                       |
| ------------------------------------------------------------- | ------------------------------------------------ |
| `generateSessionRecap(sessionId, context?)`                   | Gerar um resumo de sessão em uma linha.          |
| `generateSessionBtw(sessionId, question, signal?, context?)`  | Responder a uma pergunta lateral / prompt btw.   |
| `executeShellCommand(sessionId, command, signal?, context?)`  | Executar um comando shell no host do daemon.     |
| `getSessionContextUsageStatus(sessionId, opts?)`              | Retornar o uso da janela de contexto.            |
| `getSessionSupportedCommandsStatus(sessionId)`                | Retornar os comandos de barra disponíveis.       |
| `getSessionTasksStatus(sessionId)`                            | Retornar um snapshot de tarefas em segundo plano.|
| `getSessionStatsStatus(sessionId)`                            | Retornar estatísticas de uso da sessão.          |
| `setSessionApprovalMode(sessionId, mode, opts, context?)`     | Atualizar o modo de aprovação de uma sessão.     |
| `detachClient(sessionId, clientId?)`                          | Desanexar um cliente explicitamente.             |
| `addRuntimeMcpServer(name, config, originatorClientId)`       | Adicionar um servidor MCP em tempo de execução.  |
| `removeRuntimeMcpServer(name, originatorClientId)`            | Remover um servidor MCP em tempo de execução.    |
| `manageMcpServer(serverName, action, originatorClientId)`     | Ativar / desativar / autenticar / limpar autenticação. |
| `generateWorkspaceAgent(description, originatorClientId)`     | Gerar uma definição de subagente com IA.         |
| `preheat()`                                                   | Aquecer o processo ACP antes da primeira sessão. |
| `getSessionLastEventId(sessionId)`                            | Ler o ID monotônico de evento da sessão.         |
| `getWorkspaceToolsStatus()`                                   | Retornar o snapshot do registro de ferramentas integradas. |
| `getWorkspaceMcpToolsStatus(serverName)`                      | Retornar ferramentas para um servidor MCP específico. |

`BridgeSpawnRequest.sessionScope` foi renomeado de `'per-client'` para
`'thread'`. `BridgeRestoredSession` agora carrega `compactedReplay`,
`liveJournal` e `lastEventId`. `BridgeClientRequestContext` é o contexto
de requisição propagado nas chamadas de bridge; ele carrega `clientId`,
`fromLoopback: boolean` e `promptId`.

## Ressalvas e Limitações Conhecidas

- `MCP_RESTART_TIMEOUT_MS = 300_000` (5 min) — o timeout da bridge para `/workspace/mcp/:server/restart` é intencionalmente grande porque `McpClientManager.MAX_DISCOVERY_TIMEOUT_MS` pode chegar a 5 min para servidores stdio. Um prazo menor geraria falsos timeouts enquanto o processo ACP continuasse reconectando em segundo plano.
- `BridgeOptions.eventRingSize > 1_000_000` lança exceção na construção.
- `connection.unstable_resumeSession` é exposto através da capacidade de daemon estável `session_resume`; `unstable_session_resume` continua sendo anunciado como um alias de compatibilidade obsoleto para SDKs antigos. Clientes devem fazer detecção de funcionalidade com `session_resume`.
- O pacote da bridge é `@qwen-code/acp-bridge` e é consumido por meio de shims de reexportação em `serve/event-bus.ts`, `serve/status.ts`, `serve/httpAcpBridge.ts` para compatibilidade retroativa com caminhos de importação pré‑F1. Código novo deve importar diretamente.

## Referências

- `packages/acp-bridge/src/bridge.ts` (esp. `createHttpAcpBridge` na linha 350+)
- `packages/acp-bridge/src/bridgeClient.ts`
- `packages/acp-bridge/src/bridgeTypes.ts`
- `packages/acp-bridge/src/bridgeOptions.ts`
- `packages/acp-bridge/src/channel.ts`
- `packages/acp-bridge/src/spawnChannel.ts`
- `packages/acp-bridge/src/bridgeErrors.ts`
- Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175).
