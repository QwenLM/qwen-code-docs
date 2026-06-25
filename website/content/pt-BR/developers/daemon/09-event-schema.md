# Esquema de Eventos Tipados do Daemon v1

## Visão geral

Cada quadro SSE emitido pelo daemon em `GET /session/:id/events` possui a forma `{ id, v, type, data, originatorClientId?, _meta? }`. `v: 1` é a versão atual de `EVENT_SCHEMA_VERSION`. O `type` provém do conjunto fechado e fixo de versão `DAEMON_KNOWN_EVENT_TYPE_VALUES`, definido em `packages/sdk-typescript/src/daemon/events.ts`; o conjunto atual possui 43 tipos de eventos conhecidos. O campo de envelope `_meta` é carimbado no limite de escrita SSE por `formatSseFrame()` em `server.ts`; veja [Metadados no nível do envelope](#envelope-level-metadata).

O SDK expõe `asKnownDaemonEvent(evt)`. Ele retorna um `KnownDaemonEvent` discriminado para tipos de eventos conhecidos e `undefined` para outros tipos. Consumidores do SDK podem, portanto, lidar com compatibilidade futura sem exigir uma atualização sincronizada do SDK quando um daemon mais novo adiciona um tipo de evento; o redutor da sessão registra esses como `unrecognizedKnownEventCount`.

O formato de transmissão está em [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Esta página é o contrato de payload para cada evento.

## Responsabilidades

- Fornecer a única fonte da verdade para o vocabulário de eventos (`DAEMON_KNOWN_EVENT_TYPE_VALUES`).
- Fornecer um envelope tipado para cada tipo de evento (`DaemonEventEnvelope<TType, TData>`).
- Fornecer redutores puros (`reduceDaemonSessionEvent`, `reduceDaemonAuthEvent`) que projetam um fluxo de eventos no estado de visualização do SDK.
- Transmitir a tag de capacidade `typed_event_schema` como um sinal informativo. Se a tag estiver ausente, `asKnownDaemonEvent` ainda recai para `unknown`.

## Vocabulário de eventos (43 tipos conhecidos)

Agrupados por domínio.

### Sessão principal

| Tipo                       | Direção      | Gatilho                                                                       | Campos principais do payload                                                               |
| -------------------------- | -------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `session_update`           | S->C           | Qualquer notificação `sessionUpdate` da ACP: texto do agente, pensamento, chamada de ferramenta ou plano | `sessionUpdate: string, content?: ...` (forma opaca da ACP)                        |
| `session_metadata_updated` | S->C           | `PATCH /session/:id/metadata`                                                 | `sessionId, displayName?`                                                        |
| `session_died`             | S->C terminal  | `channel.exited`                                                              | `sessionId, reason, exitCode? \| null, signalCode? \| null`                      |
| `session_closed`           | S->C terminal  | `DELETE /session/:id` ou fechamento programático                                   | `sessionId, reason: 'client_close' \| string, closedBy?`                         |
| `session_snapshot`         | S->C sintético | Quadro de snapshot após anexo/replay SSE | `sessionId, currentModelId: string \| null, currentApprovalMode: string \| null` |

### Quadros sintéticos no nível do assinante

| Tipo                    | Gatilho                                                                                                                                                                                                                              | Notas                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client_evicted`        | Estouro da fila EventBus por assinante. **Sem `id`**                                                                                                                                                                                  | `reason: string, droppedAfter?: number`; terminal apenas para o assinante atual, enquanto a sessão permanece viva.                                                                                                                                                                                                            |
| `slow_client_warning`   | Fila >= 75%; enviado à força e **não possui `id`**                                                                                                                                                                                       | `queueSize, maxQueued, lastEventId`; rearmado após a fila cair abaixo de 37,5%.                                                                                                                                                                                                                                               |
| `stream_error`          | `SubscriberLimitExceededError` ou outro erro de rota de stream                                                                                                                                                                         | `error: string`; terminal para a assinatura.                                                                                                                                                                                                                                                                                |
| `state_resync_required` | `subscribe({lastEventId})` detecta que o anel do daemon não contém mais `[lastEventId+1, earliestInRing-1]`, ou o cursor do cliente é de uma época de barramento anterior. Enviado à força **antes** dos quadros de replay restantes e **não possui `id`**. | `reason: 'ring_evicted' \| 'epoch_reset' \| string`, `lastDeliveredId: number`, `earliestAvailableId: number`. Este é um sinal de recuperação, não terminal: o fluxo SSE permanece aberto e os quadros de replay + ao vivo continuam. O redutor do SDK define `awaitingResync = true` e ignora deltas até que o chamador reinicie com `loadSession`. |
| `replay_complete`       | Sentinela sem id emitida após o loop de replay `Last-Event-ID` terminar, tanto para replay limpo quanto para caminhos de anel expulso, mesmo quando `data.replayedCount === 0`. **Sem `id`**                                                             | `replayedCount: number`; permite que consumidores removam a UI de atualização de forma determinística sem um timeout.                                                                                                                                                                                                                                |
### Permissões (F3 + base)

| Tipo                          | Direção | Gatilho                                            | Campos principais do payload                                                                                                                               |
| ----------------------------- | ------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permission_request`          | S->C    | Agente chama `requestPermission`                   | `requestId, sessionId, toolCall, options[]`; o envelope carimba `originatorClientId` da origem do prompt.                                                |
| `permission_resolved`         | S->C    | Mediador decidiu                                   | `requestId, outcome` (ACP `PermissionOutcome`)                                                                                                           |
| `permission_already_resolved` | S->C    | Voto chega após a requisição já ter sido decidida  | `requestId, sessionId, outcome`                                                                                                                          |
| `permission_partial_vote`     | S->C    | Política `consensus` registra um voto não final    | `requestId, sessionId, votesReceived, votesNeeded (>= 1), quorum, optionTallies: Record<string, number>, originatorClientId?`                             |
| `permission_forbidden`        | S->C    | Política rejeita um voto                           | `requestId, sessionId, clientId?, reason: 'designated_mismatch' \| 'remote_not_allowed', originatorClientId?`; eleitores anônimos omitem `clientId`. |

### Modelos

| Tipo                  | Direção | Payload                                      |
| --------------------- | ------- | -------------------------------------------- |
| `model_switched`      | S->C    | `sessionId, modelId`                         |
| `model_switch_failed` | S->C    | `sessionId, requestedModelId, error: string` |

### Proteções MCP (PR 14b + F2)

| Tipo                         | Direção | Payload                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp_budget_warning`         | S->C    | `liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' \| 'enforce', scope?: 'workspace' \| 'session'`                                                                                                                                                                                                                                                                                                                             |
| `mcp_child_refused_batch`    | S->C    | `refusedServers: [{ name, transport, reason: 'budget_exhausted' }], budget, liveCount, reservedCount, mode: 'enforce', scope?: 'workspace' \| 'session'`                                                                                                                                                                                                                                                                                          |
| `mcp_server_restarted`       | S->C    | `serverName, durationMs, entryIndex?` para reinicializações de pool multi-entrada F2                                                                                                                                                                                                                                                                                                                                                                |
| `mcp_server_restart_refused` | S->C    | `serverName, reason: 'budget_would_exceed' \| 'in_flight' \| 'disabled' \| 'restart_failed', entryIndex?, details?`. O quarto valor, `restart_failed`, carrega uma falha grave subjacente para reinicialização multi-entrada em modo pool. `MCP_RESTART_REFUSED_REASONS` rejeita razões desconhecidas; um redutor mais antigo do SDK descarta silenciosamente novos valores de razão aditivos porque `parseDaemonEvent` retorna `undefined`. Envie uma nova razão com um SDK que a conheça. |
### Controle de mutação (Wave 4 PR 16+17)

| Tipo                    | Direção | Payload                                                                                              |
| ----------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `memory_changed`        | S->C    | `scope: 'workspace' \| 'global', filePath, mode: 'append' \| 'replace', bytesWritten`                |
| `agent_changed`         | S->C    | `change: 'created' \| 'updated' \| 'deleted', name, level: 'project' \| 'user'`                      |
| `approval_mode_changed` | S->C    | `sessionId, previous, next, persisted: boolean`                                                      |
| `tool_toggled`          | S->C    | `toolName, enabled`; afeta o próximo spawn filho do ACP e não modifica sessões já em execução.       |
| `settings_changed`      | S->C    | A gravação das configurações do workspace foi concluída. O payload está aberto; os consumidores devem atualizar com leitura após gravação. |
| `settings_reloaded`     | S->C    | O serviço de workspace do daemon leu novamente as configurações. O payload está aberto.              |
| `workspace_initialized` | S->C    | `path, action: 'created' \| 'overwrote' \| 'noop', originatorClientId?`                             |

### Fluxo de dispositivo de autenticação (PR 21)

Estes eventos são chaveados por workspace, não por sessão. O reducer de sessão os trata como no-ops; `reduceDaemonAuthEvent` os projeta no estado de nível de workspace.

| Tipo                          | Direção | Payload                                               |
| ----------------------------- | ------- | ----------------------------------------------------- |
| `auth_device_flow_started`    | S->C    | `deviceFlowId, providerId, expiresAt`                 |
| `auth_device_flow_throttled`  | S->C    | `deviceFlowId, intervalMs`                            |
| `auth_device_flow_authorized` | S->C    | `deviceFlowId, providerId, expiresAt?, accountAlias?` |
| `auth_device_flow_failed`     | S->C    | `deviceFlowId, errorKind, hint?`                      |
| `auth_device_flow_cancelled`  | S->C    | `deviceFlowId`                                        |

### Mutação em tempo de execução do MCP

| Tipo                 | Direção | Gatilho                                                       | Campos principais do payload                                                           |
| -------------------- | ------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `mcp_server_added`   | S->C    | Servidor adicionado em tempo de execução através de `POST /workspace/mcp/servers` | `name, transport, replaced, shadowedSettings, toolCount, originatorClientId`           |
| `mcp_server_removed` | S->C    | Servidor removido em tempo de execução                        | `name, wasShadowingSettings, originatorClientId`                                       |

### Ciclo de vida de turno / pushes do assistente

| Tipo                  | Direção | Gatilho                                                                                                             | Campos principais do payload                                                                                                                                                                               |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt_cancelled`    | S->C    | O prompt foi cancelado através da rota explícita `cancelSession` **ou** desconexão SSE do originador                | O envelope carimba `originatorClientId` para o cliente que está cancelando. Isso significa "cancelamento solicitado", não "cancelamento confirmado". Os assinantes pares aprendem que o prompt terminou.  |
| `turn_complete`       | S->C    | Um turn foi concluído com sucesso                                                                                   | `sessionId, stopReason, promptId?`. `promptId` vincula-se a respostas de prompt não bloqueantes (`202`). O SDK combina eventos SSE ao prompt originador através dele.                                       |
| `turn_error`          | S->C    | Um turn falhou                                                                                                      | `sessionId, message, code?, promptId?`; mesmo mecanismo de correlação de `promptId`.                                                                                                                       |
| `session_rewound`     | S->C    | `POST /session/:id/rewind` bem-sucedido                                                                             | `sessionId, promptId, targetTurnIndex, filesChanged[], filesFailed[], originatorClientId?`                                                                                                                |
| `session_branched`    | S->C    | `POST /session/:id/branch` criou uma ramificação a partir de uma sessão existente                                  | `sourceSessionId, newSessionId, displayName, originatorClientId?`                                                                                                                                          |
| `followup_suggestion` | S->C    | Filho do ACP gerou sugestões de acompanhamento em texto fantasma após `end_turn`, encaminhadas via SSE por sessão  | `sessionId, suggestion, promptId`; o fio transporta apenas sugestões cujo `getFilterReason()===null`. Os clientes as renderizam como texto fantasma no placeholder de entrada e as invalidam no próximo `sendPrompt`. |
| `user_shell_command`  | S->C    | O usuário iniciou um comando shell através de `POST /session/:id/shell`; distribuído para outros assinantes na mesma sessão | `sessionId, command, shellId, originatorClientId?`. Ainda não há uma interface tipada `DaemonXxxData`; `asKnownDaemonEvent` retorna `undefined` e o normalizador da UI o analisa ad hoc.                    |
| `user_shell_result`   | S->C    | Resultado do comando shell acima                                                                                    | `sessionId, shellId, exitCode, output, aborted`. Mesma nota de análise ad hoc que `user_shell_command`.                                                                                                    |
## Arquitetura

| Preocupação                             | Fonte                                           | Observações                                                                                                         |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `EVENT_SCHEMA_VERSION = 1`              | `packages/acp-bridge/src/eventBus.ts`           | Enviado em cada frame.                                                                                              |
| `DAEMON_KNOWN_EVENT_TYPE_VALUES`        | `packages/sdk-typescript/src/daemon/events.ts`  | Lista fechada com 43 tipos.                                                                                         |
| `DaemonEventEnvelope<TType, TData>`     | `events.ts`                                     | Envelope genérico.                                                                                                  |
| `DaemonKnownEventType`                  | `events.ts`                                     | `typeof DAEMON_KNOWN_EVENT_TYPE_VALUES[number]`.                                                                    |
| Tipos de payload por evento             | `events.ts`                                     | A maioria dos tipos de evento tem uma interface `DaemonXxxData`; `user_shell_*` atualmente é analisado ad hoc pelo normalizador da interface. |
| `asKnownDaemonEvent(evt)`               | `events.ts`                                     | Retorna `KnownDaemonEvent \| undefined`.                                                                            |
| `reduceDaemonSessionEvent(state, evt)`  | `events.ts`                                     | Projeta em `DaemonSessionViewState`.                                                                                |
| `reduceDaemonAuthEvent(state, evt)`     | `events.ts`                                     | Projeta em `DaemonAuthState`.                                                                                       |
| `isWorkspaceScopedBudgetEvent(evt)`     | `events.ts`                                     | Detecta F2 `scope: 'workspace'`.                                                                                    |

### `DaemonSessionViewState`

`reduceDaemonSessionEvent` preenche este estado de visualização. O adaptador CLI TUI, o `DaemonChannelBridge` e o VS Code IDE o consomem. Campos principais:

- `alive: boolean` - torna-se `false` após um frame terminal (`session_died`, `session_closed`, `client_evicted`, `stream_error`).
- `currentModelId?: string` - de `model_switched`.
- `displayName?: string` - de `session_metadata_updated`.
- `pendingPermissions: Record<string, DaemonPermissionRequestData>` - solicitações abertas indexadas por `requestId`; limpas por `permission_resolved` / `permission_already_resolved`.
- `lastSessionUpdate?: DaemonSessionUpdateData` - último `session_update`.
- `lastModelSwitchFailure?: DaemonModelSwitchFailedData` - de `model_switch_failed`.
- `terminalEvent?` - evento terminal bruto.
- `streamError?: DaemonStreamErrorData` - último payload de `stream_error`.
- `unrecognizedKnownEventCount`, `lastUnrecognizedKnownEvent?` - evento foi reconhecido por `asKnownDaemonEvent` mas o redutor ainda não possui estado dedicado para ele.
- `droppedPermissionRequestCount`, `lastDroppedPermissionRequestId?` - solicitação de permissão malformada não pôde entrar no mapa de pendentes.
- `unmatchedPermissionResolutionCount`, `lastUnmatchedPermissionResolutionId?` - resolução de permissão não teve solicitação pendente correspondente.
- `slowClientWarningCount`, `lastSlowClientWarning?` - de `slow_client_warning`.
- `mcpBudgetWarningCount`, `lastMcpBudgetWarning?` - de `mcp_budget_warning`.
- `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch?` - de `mcp_child_refused_batch`.
- `lastWorkspaceMutation?`, `lastWorkspaceMutationType?` - de `memory_changed` / `agent_changed`.
- `approvalMode?`, `approvalModeChangedCount`, `lastApprovalModeChange?` - de `approval_mode_changed`.
- `toolToggleCount`, `lastToolToggle?` - de `tool_toggled`.
- `workspaceInitCount`, `lastWorkspaceInit?` - de `workspace_initialized`.
- `mcpRestartCount`, `lastMcpRestart?` - de `mcp_server_restarted`.
- `mcpRestartRefusedCount`, `lastMcpRestartRefused?` - de `mcp_server_restart_refused`.
- `settings_changed` / `settings_reloaded` - reconhecidos por `asKnownDaemonEvent`; o redutor de sessão não mantém campos de estado de visualização dedicados, e as interfaces geralmente os tratam como sinais de atualização.
- `permissionVoteProgress: Record<string, DaemonPermissionPartialVoteData>` - progresso de votação por consenso.
- `forbiddenVotes: DaemonPermissionForbiddenData[]`, `forbiddenVoteCount` - registros de votos rejeitados por política, limitados a 32.
- `awaitingResync: boolean` - definido por `state_resync_required`; limpo quando o consumidor redefine o estado de visualização.
- `resyncRequiredCount`, `lastResyncRequired?` - observabilidade de ressincronização.
- `lastFollowupSuggestion?: DaemonFollowupSuggestionData` - última sugestão de acompanhamento enviada pelo daemon.
- `lastTurnComplete?: DaemonTurnCompleteData` - última conclusão de turno bem-sucedida.
- `lastTurnError?: DaemonTurnErrorData` - último erro de turno.
- `rewindCount`, `lastRewind?`, `lastBranch?` - últimos eventos de retrocesso / ramificação.
### `DaemonAuthState`

Uma entrada por `providerId`, orientada por `auth_device_flow_*`. Cada fluxo expõe `{ deviceFlowId, status, providerId, expiresAt?, lastThrottleIntervalMs?, lastError? }`.

## Fluxo

### Lado produtor

```mermaid
flowchart LR
    A["Notificação ACP filho"] --> B["BridgeClient.sessionUpdate /<br/>BridgeClient.extNotification"]
    B --> C{"Mapeado para tipo de evento?"}
    C -->|sim| D["EventBus.publish({type, data, originatorClientId?})"]
    C -->|não| E["Sem emissão (ignorar ou registrar)"]
    D --> F["Atribuir id + v=1, inserir no anel"]
    F --> G["Distribuir para todos os assinantes"]
```

### Lado consumidor (SDK)

```mermaid
flowchart LR
    A["Bytes SSE"] --> B["parseSseStream -> DaemonEvent[]"]
    B --> C["asKnownDaemonEvent(evt)"]
    C -->|"KnownDaemonEvent"| D["reduceDaemonSessionEvent(state, evt)"]
    C -->|"auth_device_flow_*"| E["reduceDaemonAuthEvent(state, evt)"]
    C -->|"undefined"| F["unrecognizedKnownEventCount++<br/>(compatibilidade futura)"]
```

## Metadados em nível de envelope

Além do payload `data` de cada evento, o daemon carimba dois campos em nível de envelope.

### `_meta.serverTimestamp` - relógio do daemon

`formatSseFrame()` em `packages/cli/src/serve/server.ts` carimba isso no limite de escrita SSE, **não** dentro de `EventBus.publish`. O tipo `BridgeEvent` em memória permanece inalterado; consumidores internos do daemon não veem `_meta`, enquanto os quadros SSE na fio veem.

```jsonc
{
  "id": 47,
  "v": 1,
  "type": "session_update",
  "data": { ... },
  "_meta": { "serverTimestamp": 1716287345123 }
}
```

A mesclagem preserva quaisquer chaves `_meta` existentes
(`{...existingMeta, serverTimestamp: Date.now()}`). **Nenhum produtor atual do daemon
escreve `_meta` em nível de envelope**. A mesclagem de alto nível é uma válvula de escape
de compatibilidade futura.

Por que é importante: UIs com vários clientes que renderizam tempo relativo ou ordenam blocos de transcrição devem usar o tempo do servidor em vez do relógio local de cada navegador/aba/telefone. O carimbo do servidor mantém a ordenação consistente entre clientes.

Acesso no SDK: prefira `event._meta?.serverTimestamp`. Caminhos de compatibilidade também podem sondar `event.serverTimestamp` ou `event.data._meta.serverTimestamp`. Não misture `data._meta` do payload ACP com `_meta` do envelope do daemon.

### `originatorClientId`

Eventos acionados por uma requisição que continha um `X-Qwen-Client-Id` registrado podem carimbar este campo. Veja [`08-session-lifecycle.md`](./08-session-lifecycle.md).

## `_meta` de chamada de ferramenta (procedência / serverId)

Isso é separado do `_meta` do envelope: os payloads ACP `session/update` podem carregar seu próprio `_meta` em `event.data._meta`. `ToolCallEmitter` (`packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`) carimba dois campos em `emitStart`, `emitResult` e `emitError`:

| Campo        | Tipo                                      | Regra de resolução                                                                                                                                                            |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `provenance` | `'builtin' \| 'mcp' \| 'subagent'`        | `ToolCallEmitter.resolveToolProvenance`: `subagentMeta` vence com `subagent`; nome da ferramenta correspondendo a `mcp__<server>__<tool>` mapeia para `mcp`; todo o resto mapeia para `builtin`. |
| `serverId`   | `string` apenas quando `provenance === 'mcp'` | Extraído heuristicamente de `mcp__<serverId>__<tool>`.                                                                                                                    |

O nome de exibição `_meta.toolName` existente é preservado. A UI usa esses campos para renderizar emblemas de ferramenta builtin / servidor MCP / subagente sem precisar reanalisar o nome da ferramenta.

## Comportamento do redutor do SDK

`reduceDaemonSessionEvent(state, evt)` em `packages/sdk-typescript/src/daemon/events.ts` projeta o fluxo em `DaemonSessionViewState`. Os campos relacionados à ressincronização são:

- **`awaitingResync: boolean`** - definido por `state_resync_required`; o chamador limpa, tipicamente após `POST /session/:id/load` redefinir o estado da visão.
- **`resyncRequiredCount: number`** - contador de observabilidade.
- **`lastResyncRequired?: DaemonStateResyncRequiredData`** - payload mais recente.

Enquanto `awaitingResync = true`, o redutor **pula a aplicação de delta** e permite apenas o conjunto fechado `RESYNC_PASSTHROUGH_TYPES`:

| Tipo de passagem           | Por que ainda é aplicado durante a ressincronização                              |
| -------------------------- | -------------------------------------------------------------------------------- |
| `state_resync_required`    | Uma segunda ressincronização rara deve atualizar `lastResyncRequired` / `resyncRequiredCount`. |
| `session_died`             | Sinal de fluxo terminal deve permanecer visível durante a ressincronização.      |
| `session_closed`           | O mesmo que acima.                                                               |
| `client_evicted`           | O mesmo que acima.                                                               |
| `stream_error`             | O mesmo que acima.                                                               |
| `session_snapshot`         | Quadro autoritativo de estado completo; seguro aplicar durante a ressincronização.|
`lastEventId` continua avançando monotonicamente através de `advanceLastEventId(base)` durante a ressincronização. Depois que o chamador faz o reset e limpa `awaitingResync`, os deltas subsequentes se alinham ao cursor correto.

`reduceDaemonAuthEvent` projeta eventos de fluxo de dispositivo em entradas de estado de autenticação no nível do workspace formatadas como
`{deviceFlowId, status, providerId, expiresAt?, lastThrottleIntervalMs?, lastError?}`
conceitualmente. No código, o redutor armazena `status`, `errorKind`, `hint`,
`intervalMs`, `lastSeenEventId`, `authorizedExpiresAt` e `accountAlias` em
`DaemonDeviceFlowReducerState`; os payloads dos eventos do daemon permanecem nos formatos por evento listados acima.

## Estado e compatibilidade futura

- Adicione um tipo de evento conhecido anexando a `DAEMON_KNOWN_EVENT_TYPE_VALUES`. SDKs antigos retornam `undefined` para tipos de evento não reconhecidos através do caminho de fallback e incrementam `unrecognizedKnownEventCount`; SDKs novos dependem da união discriminada.
- Adicionar campos opcionais a um payload existente é seguro porque os payloads são abertos (`{ [key: string]: unknown }`).
- Alterar a **forma** de um payload existente é uma quebra e deve incrementar `EVENT_SCHEMA_VERSION` além de anunciar uma tag de capacidade compatível como `caps.features.typed_event_schema_v2`.
- `id` é monotônico por sessão. Frames sintéticos no nível do assinante (`client_evicted`, `slow_client_warning`, `stream_error`, `state_resync_required`, `replay_complete`, `session_snapshot`) intencionalmente não possuem id para que outros assinantes não vejam lacunas.
- `originatorClientId` vive no envelope em vez de `data`. Payloads de voto parcial proibido do F3 também o mesclam em `data` através de `mergeOriginator` para que consumidores do estado da visão não precisem reter o envelope.

## Dependências

- [`10-event-bus.md`](./10-event-bus.md) - canal de entrega.
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - como SDKs fazem preflight de `typed_event_schema`, `mcp_guardrail_events` e `permission_mediation`.
- [`04-permission-mediation.md`](./04-permission-mediation.md) - como eventos de permissão são produzidos.
- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - `asKnownDaemonEvent`, redutores e formato do estado da visão.

## Configuração

- Sempre anunciados: `typed_event_schema`, `mcp_guardrail_events` e `permission_mediation` (com os modos de política suportados).
- Nenhuma variável de ambiente ou flag controla diretamente o esquema em si. `QWEN_SERVE_NO_MCP_POOL=1` altera o `scope` do evento MCP de `'workspace'` para ausente ou `'session'`.

## Riscos e limitações conhecidas

- Seis tipos de frame sintéticos intencionalmente não possuem `id`; o código do SDK não deve presumir que todo evento tem um id.
- `permission_partial_vote` aparece apenas sob `consensus`. `permission_forbidden` aparece sob `designated`, `consensus` e `local-only`, mas não sob `first-responder`.
- `mcp_child_refused_batch` aparece apenas em `mode: 'enforce'`; o modo `warn` nunca recusa.
- Eventos `auth_device_flow_*` não são chaveados por sessão. Ao consumir através de `DaemonSessionClient`, use `reduceDaemonAuthEvent` para eles em vez do redutor de sessão.

## Referências

- `packages/sdk-typescript/src/daemon/events.ts`
- `packages/acp-bridge/src/eventBus.ts` (`EVENT_SCHEMA_VERSION`)
- `packages/cli/src/serve/capabilities.ts` (`typed_event_schema`, `mcp_guardrail_events`, `permission_mediation`)
- Referência do protocolo: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
