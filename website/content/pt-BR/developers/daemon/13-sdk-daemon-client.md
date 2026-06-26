# Cliente Daemon do SDK TypeScript

## Visão Geral

`packages/sdk-typescript/src/daemon/` é o **cliente daemon do SDK TypeScript**. É a forma canônica de se conectar a um daemon em execução do `qwen serve` a partir de qualquer host TypeScript/JavaScript (o adaptador TUI da própria CLI, backends de bot de canal, o complemento da IDE VS Code, scripts personalizados e backends web no lado do servidor). Todos os outros adaptadores dependem dele.

A estrutura do pacote é intencionalmente pequena:

| Arquivo                   | Superfície                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                | Barrel público (`DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, `parseSseStream`, redutores de eventos, tipos).           |
| `DaemonClient.ts`         | Fachada HTTP/SSE de baixo nível — um método por rota do `qwen-serve-protocol.md`.                                                  |
| `DaemonSessionClient.ts`  | Wrapper com escopo de sessão e rastreamento de replay SSE.                                                                         |
| `DaemonAuthFlow.ts`       | Helper de alto nível para OAuth device-flow.                                                                                       |
| `sse.ts`                  | `parseSseStream` (analisador de framing NDJSON/SSE).                                                                               |
| `events.ts`               | `asKnownDaemonEvent`, `reduceDaemonSessionEvent`, `reduceDaemonAuthEvent` (veja [`09-event-schema.md`](./09-event-schema.md)).     |
| `types.ts`                | `DaemonCapabilities`, `DaemonSession`, `DaemonEvent`, `PermissionResponse`, `PromptResult`, tipos MCP/agent/memory/auth.           |

O exemplo prático está em [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md); este documento é a referência de arquitetura e contrato.

## Responsabilidades

- Fornecer um método TypeScript para cada rota HTTP do daemon.
- Aplicar corretamente o bearer token + `X-Qwen-Client-Id` em toda requisição.
- Compor timeouts por chamada com `AbortSignal` fornecido pelo chamador (sem interromper SSE de longa duração).
- Transmitir e analisar frames SSE em `DaemonEvent` tipados.
- Rastrear `lastSeenEventId` por sessão para que reconexões repliquem corretamente.
- Expor uma superfície de autenticação device-flow que consulta o daemon em intervalos fornecidos por ele.

## Arquitetura

### `DaemonClient` (`DaemonClient.ts`)

Construtor:

```ts
new DaemonClient({
  baseUrl: string,                  // default 'http://127.0.0.1:4170'
  token?: string,
  fetch?: typeof globalThis.fetch,  // injetável para testes
  fetchTimeoutMs?: number,          // 0 = desabilitado; padrão DEFAULT_FETCH_TIMEOUT_MS
});
```

Grupos de métodos (todo método aceita um `clientId` opcional para aplicar `X-Qwen-Client-Id`):

| Grupo                | Métodos                                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Infraestrutura       | `health()`, `capabilities()`, `auth` (acessador lazy do `DaemonAuthFlow`)                                                                                                                                                         |
| Sessões              | `createOrAttachSession`, `loadSession`, `resumeSession`, `listSessions`, `closeSession`, `setSessionMetadata`, `getSessionContext`, `getSessionSupportedCommands`, `setSessionApprovalMode`, `setSessionModel`                     |
| Prompts              | `prompt`, `cancel`, `heartbeat`                                                                                                                                                                                                   |
| Eventos              | `subscribeEvents` (gerador SSE), `subscribeEventsStream` (resposta bruta)                                                                                                                                                         |
| Permissões           | `respondToPermission`, `respondToSessionPermission`                                                                                                                                                                               |
| Snapshots do workspace | `getWorkspaceMcp`, `getWorkspaceSkills`, `getWorkspaceProviders`, `getWorkspaceEnv`, `getWorkspacePreflight`                                                                                                                    |
| Mutação do workspace | `writeWorkspaceMemory`, `readWorkspaceMemory`, `listWorkspaceAgents`, `getWorkspaceAgent`, `createWorkspaceAgent`, `updateWorkspaceAgent`, `deleteWorkspaceAgent`, `toggleWorkspaceTool`, `restartMcpServer`, `initializeWorkspace` |
| Arquivos             | `readFile`, `readFileBytes`, `writeFile`, `editFile`, `listDirectory`, `globPaths`, `statPath`                                                                                                                                    |
| Autenticação         | `startDeviceFlow`, `pollDeviceFlow`, `cancelDeviceFlow`, `getAuthStatus`                                                                                                                                                          |

### `fetchWithTimeout`

Toda requisição passa por `fetchWithTimeout`. Detalhes críticos:

- **A leitura do body está dentro do escopo do timer.** Implementações anteriores limpavam o timer quando os cabeçalhos chegavam; se um proxy travasse no meio do body, `await res.json()` poderia travar além de `fetchTimeoutMs`. A forma atual passa o código de leitura do body como um callback para que o timer cubra tanto a chegada do cabeçalho quanto o consumo do body.
- **`perCallTimeoutMs`** permite que uma única chamada substitua o timeout padrão do cliente. O chamador mais visível é `restartMcpServer`: o SDK usa `MCP_RESTART_DEFAULT_TIMEOUT_MS = 330_000` (5 min 30s). O próprio daemon tem `MCP_RESTART_TIMEOUT_MS` de exatamente 300s; se o cliente usasse o mesmo valor, uma reinicialização que levasse próximo de 300s poderia perder a corrida enquanto o daemon serializa e envia sua resposta estruturada, causando um `TimeoutError` falso positivo. Os 30s extras cobrem serialização, transferência de rede e decodificação em ambos os lados. Chamadores que precisam de um orçamento mais apertado podem passar `timeoutMs`; passar `0` desabilita o timeout.
- **`AbortSignal.any`** compõe o sinal fornecido pelo chamador com o sinal do timer por chamada, de modo que tanto o cancelamento do chamador quanto o timeout por chamada abortam limparmente.
- **`AbortController` + `setTimeout` cancelável** em vez de `AbortSignal.timeout()` para que requisições que resolvem rapidamente não vazem timers pendentes no event loop. O timer é limpo no `finally`.
- **Endpoints de streaming (`subscribeEvents`) ignoram o timeout** — conexões SSE de longa duração não devem ser interrompidas por ele.

### `DaemonSessionClient` (`DaemonSessionClient.ts`)

Vincula uma sessão e rastreia automaticamente `lastSeenEventId` para que replay e reconexão SSE funcionem sem estado extra do chamador.

```ts
class DaemonSessionClient {
  readonly client: DaemonClient;
  readonly session: DaemonSession;
  readonly state: DaemonSessionState;
  private lastSeenEventId: number | undefined;

  static createOrAttach(client, req?): Promise<DaemonSessionClient>;
  static load(client, sessionId, req?): Promise<DaemonSessionClient>;
  static resume(client, sessionId, req?): Promise<DaemonSessionClient>;

  events(opts?: DaemonSessionSubscribeOptions): AsyncIterable<DaemonEvent>;
  prompt(req: PromptRequest): Promise<PromptResult>;
  cancel(): Promise<void>;
  respondToPermission(...): Promise<PermissionResponse>;
  setModel(modelServiceId): Promise<SetModelResult>;
  heartbeat(): Promise<HeartbeatResult>;
  setMetadata(metadata): Promise<SessionMetadataResult>;
  close(): Promise<void>;
}
```

`events()` delega para `client.subscribeEvents` com `resume: true` por padrão — ele passa o `lastSeenEventId` rastreado para que reconexões repliquem a partir de onde a assinatura anterior parou. Cada evento produzido incrementa `lastSeenEventId`.

### `DaemonAuthFlow` (`DaemonAuthFlow.ts`)

```ts
class DaemonAuthFlow {
  start(opts: { providerId, ... }): Promise<DaemonAuthFlowHandle>;
}
interface DaemonAuthFlowHandle {
  deviceFlowId: string;
  providerId: string;
  expiresAt: string;
  verificationUrl: string;
  userCode: string;
  awaitCompletion(opts?): Promise<DaemonAuthDeviceFlowState>;
  cancel(): Promise<void>;
}
```

`awaitCompletion()` consulta `GET /workspace/auth/device-flow/:id` no `intervalMs` fornecido pelo daemon até que o fluxo se torne `authorized`, `failed` ou `cancelled`. Ele é construído de forma lazy via `client.auth`, de modo que clientes que nunca utilizam autenticação não incorrem em custo de alocação.

### `parseSseStream` (`sse.ts`)

Transforma um `Response.body` (`ReadableStream<Uint8Array>`) em `AsyncIterable<DaemonEvent>`. Lida com:

- Framing LF e CRLF.
- Limite de estouro de buffer (16 MiB) — limite defensivo contra o daemon emitir um único frame absurdamente grande.
- Ligação com `AbortSignal` — abortar fecha o stream e o iterador.
- Frames apenas de comentário e tipos de evento desconhecidos (passados como `DaemonEvent`; consumidores do SDK estreitam depois via `asKnownDaemonEvent`).

### Tipos (`types.ts`)

Exportações notáveis: `DaemonCapabilities`, `DaemonSession` (`{ sessionId, workspaceCwd, attached, clientId?, createdAt? }`), `DaemonEvent`, `DaemonSessionState`, `DaemonSessionContextStatus`, `DaemonSessionSupportedCommandsStatus`, `PermissionResponse`, `PromptResult`, `HeartbeatResult`, `SetModelResult`, `SessionMetadataResult`, além de tipos de resultado MCP/agent/memory/auth.

## Workflow

### Criar-ou-vincular + primeiro prompt

```mermaid
sequenceDiagram
    autonumber
    participant App as App code
    participant SC as DaemonSessionClient
    participant DC as DaemonClient
    participant D as Daemon

    App->>SC: DaemonSessionClient.createOrAttach(client, {clientId: 'alice'})
    SC->>DC: client.createOrAttachSession({}, 'alice')
    DC->>D: POST /session<br/>Authorization: Bearer ...<br/>X-Qwen-Client-Id: alice
    D-->>DC: {sessionId, attached, clientId}
    DC-->>SC: DaemonSession
    SC-->>App: DaemonSessionClient

    App->>SC: prompt({...})
    SC->>DC: client.prompt(sessionId, req, 'alice')
    DC->>D: POST /session/:id/prompt
    D-->>DC: {result}
    DC-->>SC: PromptResult
```

### Assinar com replay

```mermaid
sequenceDiagram
    autonumber
    participant App as App code
    participant SC as DaemonSessionClient
    participant DC as DaemonClient
    participant D as Daemon
    participant P as parseSseStream

    App->>SC: for await (e of session.events())
    SC->>DC: client.subscribeEvents(sessionId, {lastEventId: <tracked>}, 'alice')
    DC->>D: GET /session/:id/events<br/>Last-Event-ID: 42
    D-->>DC: SSE bytes (replay then live)
    DC->>P: parseSseStream(res.body, signal)
    loop per frame
        P-->>SC: DaemonEvent
        SC->>SC: bump lastSeenEventId
        SC-->>App: DaemonEvent
        App->>App: asKnownDaemonEvent + reduce
    end
```

### Autenticação device-flow

```mermaid
sequenceDiagram
    autonumber
    participant App as App
    participant AF as DaemonAuthFlow
    participant DC as DaemonClient
    participant D as Daemon

    App->>AF: start({providerId: 'qwen-oauth'})
    AF->>DC: client.startDeviceFlow(...)
    DC->>D: POST /workspace/auth/device-flow
    D-->>DC: {deviceFlowId, verificationUrl, userCode, intervalMs, expiresAt}
    DC-->>AF: handle
    AF-->>App: handle (with awaitCompletion())
    App->>AF: handle.awaitCompletion()
    loop until done
        AF->>D: GET /workspace/auth/device-flow/:id
        D-->>AF: {status: 'pending' | 'authorized' | ...}
        AF->>AF: setTimeout(intervalMs)
    end
    AF-->>App: final state
```

`qwen-oauth` é o identificador de provedor legado v1. O nível gratuito do Qwen OAuth foi descontinuado em 15/04/2026, portanto novos clientes devem preferir um provedor de autenticação atualmente suportado quando disponível.

## Estado & Ciclo de Vida

- `DaemonClient` não possui conexão; nada acontece na construção. Cada método abre um `fetch` novo.
- `DaemonSessionClient` retém `lastSeenEventId` entre invocações de `events()`; reconexões replicam a partir do último visto.
- `DaemonAuthFlow` é lazy — `client.auth` constrói na primeira utilização.
- O iterador SSE é fechado quando (a) o daemon encerra o stream, (b) `AbortSignal.abort()` dispara, (c) o consumidor sai do `for await` ou (d) o limite de estouro de buffer (16 MiB) é atingido.

## Dependências

- `globalThis.fetch` (embutido no Node 18+, navegador, undici, etc.). Injetável por `DaemonClient` para testes.
- `AbortController` / `AbortSignal.any` / `setTimeout` nativos.
- Nenhuma dependência transitiva de `@qwen-code/qwen-code-core` ou `@qwen-code/acp-bridge` — o pacote SDK é totalmente desacoplado para que consumidores externos não puxem as entranhas do daemon.

## Subpacote `ui/*` ([#4328](https://github.com/QwenLM/qwen-code/pull/4328) + [#4353](https://github.com/QwenLM/qwen-code/pull/4353))

O SDK também exporta `packages/sdk-typescript/src/daemon/ui/`, um conjunto de primitivas neutras de host que transformam eventos do daemon em blocos de transcrição:

- `normalizeDaemonEvent(evt)` mapeia os 43 eventos de fio conhecidos do daemon em 37 valores `DaemonUiEventType` amigáveis para a UI; eventos não modelados ou malformados são normalizados para `debug`.
- `createDaemonTranscriptState()` mais `reduceDaemonTranscriptEvents(state, events)` projeta eventos de UI em `DaemonTranscriptBlock[]`.
- `createDaemonTranscriptStore()` encapsula subscribe/dispatch.
- `render.ts` / `terminal.ts` fornecem renderizadores de linha de base para HTML e terminal, enquanto `toolPreview.ts` produz resumos de tool-call.
- Seletores incluem `selectTranscriptBlocksOrderedByEventId`, `selectPendingPermissionBlocks`, `selectCurrentTool`, `selectApprovalMode`, `selectToolProgress`, `selectSubagentChildBlocks`, `formatMissedRange` e `formatBlockTimestamp`.
- Constantes públicas incluem `DAEMON_PLAN_TOOL_CALL_ID`.
- `conformance.ts` contém a suíte de testes de consistência entre hosts.

O primeiro consumidor em produção é `packages/webui/src/daemon/` através do `DaemonSessionProvider` do React. Consulte [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) para a arquitetura detalhada, glossário, tabela de seletores e relação com o legado `DaemonTuiAdapter`.

O subpacote é exportado do subcaminho `@qwen-code/sdk/daemon`. O código existente que faz `import { DaemonClient }` não é afetado.

## Configuração

| Parâmetro          | Onde                                  | Efeito                                                                                 |
| ------------------ | ------------------------------------- | -------------------------------------------------------------------------------------- |
| `baseUrl`          | Construtor `DaemonClient`             | URL do daemon; barras no final removidas.                                              |
| `token`            | Construtor `DaemonClient`             | Aplicado como `Authorization: Bearer`.                                                 |
| `fetch`            | Construtor `DaemonClient`             | Ponto de injeção para testes.                                                          |
| `fetchTimeoutMs`   | Construtor `DaemonClient`             | Timeout por chamada; `0` = desabilitado.                                               |
| `clientId`         | Argumento opcional por método         | Cabeçalho `X-Qwen-Client-Id` (veja [`08-session-lifecycle.md`](./08-session-lifecycle.md)). |
| `lastEventId`      | Construtor `DaemonSessionClient`      | Semear cursor de replay.                                                               |
| `maxQueued`        | Opção por assinatura                  | `?maxQueued=N` para a rota SSE; verifique `caps.features.slow_client_warning` primeiro. |
| `perCallTimeoutMs` | Por método (ex.: `restartMcpServer`)  | Substitui o timeout padrão do cliente.                                                 |

## Caveats & Limitações Conhecidas

- **`fetchTimeoutMs` é por chamada, não no nível da conexão.** Leituras longas de body compartilham o timer. Um daemon que transmite respostas deve substituir o timeout por chamada ou definir o timeout como `0`.
- **SSE ignora o fetch timeout** — conexões SSE de longa duração não são interrompidas por `fetchTimeoutMs`. Use `AbortSignal` para cancelamento controlado pelo chamador.
- **Limite de buffer do `parseSseStream` é 16 MiB** como limite defensivo. Um frame único maior que isso aborta o iterador (o daemon nunca emite tais frames legitimamente).
- **`asKnownDaemonEvent` retorna `undefined` para tipos de evento não reconhecidos.** Consumidores do SDK devem tratar esse ramo em vez de assumir que a união é exaustiva; esse é o contrato de compatibilidade futura. Eventos não reconhecidos incrementam `DaemonSessionViewState.unrecognizedKnownEventCount`.
- **`client_evicted`, `slow_client_warning`, `stream_error` não estão no ring de replay.** Reconectar após despejo retoma a partir do ring do daemon; você não verá o frame de despejo novamente.
- **`DaemonClient` não faz retry automático.** Falhas de rede se manifestam como rejeições; a estratégia de reconexão/replay é responsabilidade do chamador (`DaemonSessionClient.events()` facilita o replay, mas a reconexão ainda é por chamada).

## Referências

- `packages/sdk-typescript/src/daemon/DaemonClient.ts`
- `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`
- `packages/sdk-typescript/src/daemon/DaemonAuthFlow.ts`
- `packages/sdk-typescript/src/daemon/sse.ts`
- `packages/sdk-typescript/src/daemon/events.ts`
- `packages/sdk-typescript/src/daemon/types.ts`
- Exemplo completo: [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md).