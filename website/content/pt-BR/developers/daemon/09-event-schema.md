# Esquema de Eventos do Daemon Tipado v1

## Visão geral

Cada frame SSE emitido pelo daemon em `GET /session/:id/events` tem a forma `{ id, v, type, data, originatorClientId?, _meta? }`. `v: 1` é o `EVENT_SCHEMA_VERSION` atual. `type` vem do conjunto fechado e fixado por versão `DAEMON_KNOWN_EVENT_TYPE_VALUES` em `packages/sdk-typescript/src/daemon/events.ts`; o conjunto atual possui 47 tipos de eventos conhecidos. O campo `_meta` do envelope é carimbado no limite de escrita do SSE por `formatSseFrame()` em `packages/cli/src/serve/routes/sse-events.ts`; consulte [Metadados no nível do envelope](#envelope-level-metadata).

O SDK expõe `asKnownDaemonEvent(evt)`. Ele retorna um `KnownDaemonEvent` discriminado para tipos de eventos conhecidos e `undefined` para outros tipos. Os consumidores do SDK podem, portanto, lidar com a compatibilidade futura (forward compatibility) sem exigir uma atualização do SDK em conjunto (lockstep) quando um daemon mais recente adiciona um tipo de evento; o reducer da sessão os registra como `unrecognizedKnownEventCount`.

O formato de transmissão (wire format) está em [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Esta página é o contrato de payload para cada evento.

## Responsabilidades

- Fornecer a fonte única da verdade para o vocabulário de eventos (`DAEMON_KNOWN_EVENT_TYPE_VALUES`).
- Fornecer um envelope tipado para cada tipo de evento (`DaemonEventEnvelope<TType, TData>`).
- Fornecer reducers puros (`reduceDaemonSessionEvent`, `reduceDaemonAuthEvent`) que projetam um fluxo de eventos no estado de visualização do SDK.
- Transmitir a tag de capacidade `typed_event_schema` como um sinal informativo. Se a tag estiver ausente, `asKnownDaemonEvent` ainda faz fallback para `unknown`.

## Vocabulário de eventos (47 tipos conhecidos)

Agrupados por domínio.

### Sessão principal

| Tipo                       | Direção      | Gatilho                                                                       | Principais campos do payload                                                               |
| -------------------------- | -------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `session_update`           | S->C           | Qualquer notificação ACP `sessionUpdate`: texto do agente, pensamento, chamada de ferramenta ou plano | `sessionUpdate: string, content?: ...` (formato ACP opaco)                        |
| `session_metadata_updated` | S->C           | `PATCH /session/:id/metadata`                                                 | `sessionId, displayName?`                                                        |
| `session_died`             | S->C terminal  | `channel.exited`                                                              | `sessionId, reason, exitCode? \| null, signalCode? \| null`                      |
| `session_closed`           | S->C terminal  | `DELETE /session/:id` ou fechamento programático                                   | `sessionId, reason: 'client_close' \| string, closedBy?`                         |
| `session_snapshot`         | S->C synthetic | Frame de snapshot após anexação / replay do SSE                                      | `sessionId, currentModelId: string \| null, currentApprovalMode: string \| null` |

### Frames sintéticos no nível do assinante

| Tipo                    | Gatilho                                                                                                                                                                                                                              | Notas                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client_evicted`        | Estouro da fila do EventBus por assinante. **Sem `id`**                                                                                                                                                                                  | `reason: string, droppedAfter?: number`; terminal apenas para o assinante atual, enquanto a sessão permanece ativa.                                                                                                                                                                                                            |
| `slow_client_warning`   | Fila >= 75%; forçado (force-pushed) e **não tem `id`**                                                                                                                                                                                       | `queueSize, maxQueued, lastEventId`; rearmado após a fila cair abaixo de 37,5%.                                                                                                                                                                                                                                               |
| `stream_error`          | `SubscriberLimitExceededError` ou outro erro de stream de rota                                                                                                                                                                         | `error: string`; terminal para a assinatura.                                                                                                                                                                                                                                                                                |
| `state_resync_required` | `subscribe({lastEventId})` detecta que o ring do daemon não contém mais `[lastEventId+1, earliestInRing-1]`, ou o cursor do cliente é de uma epoch anterior do bus. Forçado (force-pushed) **antes** dos frames de replay restantes e **não tem `id`**. | `reason: 'ring_evicted' \| 'epoch_reset' \| string`, `lastDeliveredId: number`, `earliestAvailableId: number`. Este é um sinal de recuperação, não terminal: o stream SSE permanece aberto e os frames de replay + ao vivo continuam. O reducer do SDK define `awaitingResync = true` e ignora os deltas até que o chamador redefina com `loadSession`. |
| `replay_complete`       | Sentinela sem ID emitida após o término do loop de replay `Last-Event-ID`, para caminhos de replay limpo e ring-evicted, mesmo quando `data.replayedCount === 0`. **Sem `id`**                                                             | `replayedCount: number`; permite que os consumidores removam a UI de catch-up de forma determinística sem timeout.                                                                                                                                                                                                                                |

### Permissões (F3 + base)

| Tipo                          | Direção | Gatilho                                            | Principais campos do payload                                                                                                                               |
| ----------------------------- | --------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `permission_request`          | S->C      | Agente chama `requestPermission`                    | `requestId, sessionId, toolCall, options[]`; o envelope carimba `originatorClientId` do originador do prompt.                                |
| `permission_resolved`         | S->C      | Mediador decidiu                               | `requestId, outcome` (ACP `PermissionOutcome`)                                                                                                   |
| `permission_already_resolved` | S->C      | Voto chega após a solicitação já ter sido decidida | `requestId, sessionId, outcome`                                                                                                                  |
| `permission_partial_vote`     | S->C      | Política `consensus` registra um voto não final        | `requestId, sessionId, votesReceived, votesNeeded (>= 1), quorum, optionTallies: Record<string, number>, originatorClientId?`                    |
| `permission_forbidden`        | S->C      | Política rejeita um voto                              | `requestId, sessionId, clientId?, reason: 'designated_mismatch' \| 'remote_not_allowed', originatorClientId?`; votantes anônimos omitem `clientId`. |

### Modelos

| Tipo                  | Direção | Payload                                      |
| --------------------- | --------- | -------------------------------------------- |
| `model_switched`      | S->C      | `sessionId, modelId`                         |
| `model_switch_failed` | S->C      | `sessionId, requestedModelId, error: string` |

### Guardrails do MCP (PR 14b + F2)

| Tipo                         | Direção | Payload                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp_budget_warning`         | S->C      | `liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' \| 'enforce', scope?: 'workspace' \| 'session'`                                                                                                                                                                                                                                                                                                                             |
| `mcp_child_refused_batch`    | S->C      | `refusedServers: [{ name, transport, reason: 'budget_exhausted' }], budget, liveCount, reservedCount, mode: 'enforce', scope?: 'workspace' \| 'session'`                                                                                                                                                                                                                                                                                          |
| `mcp_server_restarted`       | S->C      | `serverName, durationMs, entryIndex?` para reinícios de pool multi-entry do F2                                                                                                                                                                                                                                                                                                                                                                            |
| `mcp_server_restart_refused` | S->C      | `serverName, reason: 'budget_would_exceed' \| 'in_flight' \| 'disabled' \| 'restart_failed', entryIndex?, details?`. O quarto valor, `restart_failed`, carrega uma falha grave subjacente para reinício multi-entry em modo pool. `MCP_RESTART_REFUSED_REASONS` rejeita motivos desconhecidos; um reducer de SDK mais antigo descarta silenciosamente novos valores de motivos aditivos porque `parseDaemonEvent` retorna `undefined`. Envie um novo motivo com um SDK que o conheça. |

### Controle de mutação (Wave 4 PR 16+17)

| Tipo                     | Direção | Payload                                                                                                                          |
| ------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `memory_changed`         | S->C      | `scope: 'workspace' \| 'global', filePath, mode: 'append' \| 'replace', bytesWritten`                                            |
| `agent_changed`          | S->C      | `change: 'created' \| 'updated' \| 'deleted', name, level: 'project' \| 'user'`                                                  |
| `approval_mode_changed`  | S->C      | `sessionId, previous, next, persisted: boolean`                                                                                  |
| `tool_toggled`           | S->C      | `toolName, enabled`; afeta o próximo spawn de filho ACP e não muta sessões já em execução.                              |
| `settings_changed`       | S->C      | Gravação de configurações do workspace concluída. O payload é aberto; os consumidores devem atualizar com read-after-write.                             |
| `settings_reloaded`      | S->C      | O serviço de workspace do daemon releu as configurações. O payload é aberto.                                                                       |
| `trust_change_requested` | S->C      | `workspaceCwd, desiredState: 'trusted' \| 'untrusted', reason?`                                                                  |
| `workspace_initialized`  | S->C      | `path, action: 'created' \| 'overwrote' \| 'noop', originatorClientId?`                                                          |
| `github_setup_completed` | S->C      | `releaseTag, readmeUrl, secretsUrl?, workflows: [{path, status, sizeBytes?, error?}], gitignore: {path, status, added?, error?}` |

### Fluxo de dispositivo de autenticação (PR 21)

Esses eventos são chaveados por workspace, não por sessão. O reducer da sessão os trata como no-ops; `reduceDaemonAuthEvent` os projeta no estado no nível do workspace.

| Tipo                          | Direção | Payload                                               |
| ----------------------------- | --------- | ----------------------------------------------------- |
| `auth_device_flow_started`    | S->C      | `deviceFlowId, providerId, expiresAt`                 |
| `auth_device_flow_throttled`  | S->C      | `deviceFlowId, intervalMs`                            |
| `auth_device_flow_authorized` | S->C      | `deviceFlowId, providerId, expiresAt?, accountAlias?` |
| `auth_device_flow_failed`     | S->C      | `deviceFlowId, errorKind, hint?`                      |
| `auth_device_flow_cancelled`  | S->C      | `deviceFlowId`                                        |

### Mutação em tempo de execução do MCP

| Tipo                 | Direção | Gatilho                                                       | Principais campos do payload                                                           |
| -------------------- | --------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `mcp_server_added`   | S->C      | Servidor adicionado em tempo de execução via `POST /workspace/mcp/servers` | `name, transport, replaced, shadowedSettings, toolCount, originatorClientId` |
| `mcp_server_removed` | S->C      | Servidor removido em tempo de execução                                     | `name, wasShadowingSettings, originatorClientId`                             |

### Ciclo de vida das extensões

| Tipo                 | Direção | Gatilho                                                              | Principais campos do payload                                                                                                                               |
| -------------------- | --------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `extensions_changed` | S->C      | Trabalho de instalação/atualização de extensão em segundo plano concluído ou alteração de status | `refreshed, failed, status?: 'installed' \| 'enabled' \| 'disabled' \| 'updated' \| 'uninstalled' \| 'failed', source?, name?, version?, error?` |

### Injeção de mensagem no meio do turno

| Tipo                        | Direção | Gatilho                                                                                         | Principais campos do payload                                                                                                                 |
| --------------------------- | --------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `mid_turn_message_injected` | S->C      | Web-shell ou cliente remoto injetou mensagens em um turno em execução via `POST /session/:id/inject` | `sessionId, messages: string[], originatorClientId?`; os consumidores DEVEM comparar `originatorClientId` com seu próprio id antes de fazer dedup. |

### Ciclo de vida do turno / pushes do assistente

| Tipo                  | Direção | Gatilho                                                                                                             | Principais campos do payload                                                                                                                                                                               |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prompt_cancelled`    | S->C      | Prompt foi cancelado através da rota explícita `cancelSession` **ou** desconexão do SSE do originador                        | O envelope carimba `originatorClientId` para o cliente que cancelou. Isso significa "cancelamento solicitado", não "cancelamento confirmado". Assinantes pares aprendem que o prompt terminou.              |
| `turn_complete`       | S->C      | Um turno foi concluído com sucesso                                                                                       | `sessionId, stopReason, promptId?`. `promptId` vincula a respostas de prompt não bloqueantes (`202`). O SDK corresponde os eventos SSE ao prompt de origem através dele.                                  |
| `turn_error`          | S->C      | Um turno falhou                                                                                                       | `sessionId, message, code?, promptId?`; mesmo mecanismo de correlação `promptId`.                                                                                                                   |
| `session_rewound`     | S->C      | `POST /session/:id/rewind` teve sucesso                                                                                | `sessionId, promptId, targetTurnIndex, filesChanged[], filesFailed[], originatorClientId?`                                                                                                       |
| `session_branched`    | S->C      | `POST /session/:id/branch` criou um branch a partir de uma sessão existente                                                | `sourceSessionId, newSessionId, displayName, originatorClientId?`                                                                                                                                |
| `followup_suggestion` | S->C      | Filho ACP gerou sugestões de acompanhamento em ghost-text após `end_turn`, encaminhadas pelo SSE por sessão               | `sessionId, suggestion, promptId`; o wire transporta apenas sugestões cujo `getFilterReason()===null`. Os clientes os renderizam como ghost-text de placeholder de input e os invalidam no próximo `sendPrompt`. |
| `user_shell_command`  | S->C      | Usuário iniciou um comando shell através de `POST /session/:id/shell`; distribuído (fanned out) para outros assinantes na mesma sessão | `sessionId, command, shellId, originatorClientId?`. Ainda não há uma interface `DaemonXxxData` tipada; `asKnownDaemonEvent` retorna `undefined` e o normalizador de UI o analisa ad hoc.            |
| `user_shell_result`   | S->C      | Resultado do comando shell acima                                                                                   | `sessionId, shellId, exitCode, output, aborted`. Mesma observação de análise ad hoc que `user_shell_command`.                                                                                               |
## Arquitetura

| Aspecto                                | Origem                                         | Notas                                                                                                              |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `EVENT_SCHEMA_VERSION = 1`             | `packages/acp-bridge/src/eventBus.ts`          | Enviado em cada frame.                                                                                               |
| `DAEMON_KNOWN_EVENT_TYPE_VALUES`       | `packages/sdk-typescript/src/daemon/events.ts` | Lista fechada com 47 tipos.                                                                                         |
| `DaemonEventEnvelope<TType, TData>`    | `events.ts`                                    | Envelope genérico.                                                                                                  |
| `DaemonKnownEventType`                 | `events.ts`                                    | `typeof DAEMON_KNOWN_EVENT_TYPE_VALUES[number]`.                                                                   |
| Tipos de payload por evento                | `events.ts`                                    | A maioria dos tipos de evento possui uma interface `DaemonXxxData`; `user_shell_*` é atualmente analisado ad hoc pelo normalizador da UI. |
| `asKnownDaemonEvent(evt)`              | `events.ts`                                    | Retorna `KnownDaemonEvent \| undefined`.                                                                           |
| `reduceDaemonSessionEvent(state, evt)` | `events.ts`                                    | Projeta em `DaemonSessionViewState`.                                                                            |
| `reduceDaemonAuthEvent(state, evt)`    | `events.ts`                                    | Projeta em `DaemonAuthState`.                                                                                   |
| `isWorkspaceScopedBudgetEvent(evt)`    | `events.ts`                                    | Detecta F2 `scope: 'workspace'`.                                                                                   |

### `DaemonSessionViewState`

`reduceDaemonSessionEvent` preenche este estado de visualização. O adaptador CLI TUI, `DaemonChannelBridge` e a IDE VS Code o consomem. Campos principais:

- `alive: boolean` - torna-se `false` após um frame terminal (`session_died`, `session_closed`, `client_evicted`, `stream_error`).
- `currentModelId?: string` - de `model_switched`.
- `displayName?: string` - de `session_metadata_updated`.
- `pendingPermissions: Record<string, DaemonPermissionRequestData>` - requisições abertas indexadas por `requestId`; limpo por `permission_resolved` / `permission_already_resolved`.
- `lastSessionUpdate?: DaemonSessionUpdateData` - `session_update` mais recente.
- `lastModelSwitchFailure?: DaemonModelSwitchFailedData` - de `model_switch_failed`.
- `terminalEvent?` - evento terminal bruto.
- `streamError?: DaemonStreamErrorData` - payload `stream_error` mais recente.
- `unrecognizedKnownEventCount`, `lastUnrecognizedKnownEvent?` - o evento foi reconhecido por `asKnownDaemonEvent`, mas o reducer ainda não possui um estado dedicado para ele.
- `droppedPermissionRequestCount`, `lastDroppedPermissionRequestId?` - requisição de permissão malformada não pôde entrar no mapa de pendências.
- `unmatchedPermissionResolutionCount`, `lastUnmatchedPermissionResolutionId?` - a resolução de permissão não tinha nenhuma requisição pendente correspondente.
- `slowClientWarningCount`, `lastSlowClientWarning?` - de `slow_client_warning`.
- `mcpBudgetWarningCount`, `lastMcpBudgetWarning?` - de `mcp_budget_warning`.
- `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch?` - de `mcp_child_refused_batch`.
- `lastWorkspaceMutation?`, `lastWorkspaceMutationType?` - de `memory_changed` / `agent_changed`.
- `approvalMode?`, `approvalModeChangedCount`, `lastApprovalModeChange?` - de `approval_mode_changed`.
- `toolToggleCount`, `lastToolToggle?` - de `tool_toggled`.
- `workspaceInitCount`, `lastWorkspaceInit?` - de `workspace_initialized`.
- `mcpRestartCount`, `lastMcpRestart?` - de `mcp_server_restarted`.
- `mcpRestartRefusedCount`, `lastMcpRestartRefused?` - de `mcp_server_restart_refused`.
- `settings_changed` / `settings_reloaded` - reconhecido por `asKnownDaemonEvent`; o reducer de sessão não mantém campos de estado de visualização dedicados, e as UIs geralmente os tratam como sinais de atualização.
- `permissionVoteProgress: Record<string, DaemonPermissionPartialVoteData>` - progresso da votação por consenso.
- `forbiddenVotes: DaemonPermissionForbiddenData[]`, `forbiddenVoteCount` - registros de votos rejeitados por política, limitados a 32.
- `awaitingResync: boolean` - definido por `state_resync_required`; limpo quando o consumidor redefine o estado de visualização.
- `resyncRequiredCount`, `lastResyncRequired?` - observabilidade de ressincronização.
- `lastFollowupSuggestion?: DaemonFollowupSuggestionData` - sugestão de acompanhamento mais recente enviada pelo daemon.
- `lastTurnComplete?: DaemonTurnCompleteData` - conclusão de turno bem-sucedida mais recente.
- `lastTurnError?: DaemonTurnErrorData` - erro de turno mais recente.
- `rewindCount`, `lastRewind?`, `lastBranch?` - eventos de rewind / branch mais recentes.

### `DaemonAuthState`

Uma entrada por `providerId`, impulsionada por `auth_device_flow_*`. Cada fluxo expõe `{ deviceFlowId, status, providerId, expiresAt?, lastThrottleIntervalMs?, lastError? }`.

## Fluxo

### Lado do produtor

```mermaid
flowchart LR
    A["Notificação filha ACP"] --> B["BridgeClient.sessionUpdate /<br/>BridgeClient.extNotification"]
    B --> C{"Mapeado para tipo de evento?"}
    C -->|sim| D["EventBus.publish({type, data, originatorClientId?})"]
    C -->|não| E["Sem emissão (descarta ou log)"]
    D --> F["Atribui id + v=1, envia para o ring"]
    F --> G["Distribui para todos os assinantes"]
```

### Lado do consumidor (SDK)

```mermaid
flowchart LR
    A["SSE bytes"] --> B["parseSseStream -> DaemonEvent[]"]
    B --> C["asKnownDaemonEvent(evt)"]
    C -->|"KnownDaemonEvent"| D["reduceDaemonSessionEvent(state, evt)"]
    C -->|"auth_device_flow_*"| E["reduceDaemonAuthEvent(state, evt)"]
    C -->|"undefined"| F["unrecognizedKnownEventCount++<br/>(compatibilidade futura)"]
```

## Metadados no nível do envelope

Além do payload `data` de cada evento, o daemon aplica dois campos no nível do envelope.

### `_meta.serverTimestamp` - relógio do daemon

`EventBus.publish()` em `packages/acp-bridge/src/eventBus.ts` aplica `_meta.serverTimestamp` quando o evento entra no barramento. O tipo `BridgeEvent` inclui `_meta?: Record<string, unknown>`, então os consumidores internos do daemon **veem** `_meta` em cada evento publicado no barramento. `formatSseFrame()` em `packages/cli/src/serve/routes/sse-events.ts` fornece um timestamp de fallback apenas para frames sintéticos (ex.: `stream_error`) que ignoram `EventBus.publish`.

```jsonc
{
  "id": 47,
  "v": 1,
  "type": "session_update",
  "data": { ... },
  "_meta": { "serverTimestamp": 1716287345123 }
}
```

A mesclagem preserva quaisquer chaves `_meta` existentes do evento de entrada
(`{...input._meta, serverTimestamp: Date.now()}`). Os produtores podem anexar
chaves `_meta` adicionais no nível do envelope; `EventBus.publish` as mescla com o
timestamp em vez de sobrescrevê-las.

Por que isso importa: UIs multi-cliente que renderizam tempo relativo ou ordenam blocos de transcrição devem usar o horário do servidor em vez do relógio local de cada navegador/aba/celular. A aplicação do timestamp pelo servidor mantém a ordenação consistente entre os clientes.

Acesso via SDK: prefira `event._meta?.serverTimestamp`. Caminhos de compatibilidade também podem sondar `event.serverTimestamp` ou `event.data._meta.serverTimestamp`. Não misture o payload ACP `data._meta` com o envelope do daemon `_meta`.

### `originatorClientId`

Eventos acionados por uma requisição que carregava um `X-Qwen-Client-Id` registrado podem aplicar este campo. Veja [`08-session-lifecycle.md`](./08-session-lifecycle.md).

## `_meta` de chamadas de ferramenta (proveniência / serverId)

Isso é separado do `_meta` do envelope: os payloads ACP `session/update` podem carregar seu próprio `_meta` em `event.data._meta`. `ToolCallEmitter` (`packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`) aplica dois campos em `emitStart`, `emitResult` e `emitError`:

| Campo        | Tipo                                      | Regra de resolução                                                                                                                                                            |
| ------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provenance` | `'builtin' \| 'mcp' \| 'subagent'`        | `ToolCallEmitter.resolveToolProvenance`: `subagentMeta` vence com `subagent`; nome da ferramenta correspondente a `mcp__<server>__<tool>` mapeia para `mcp`; todo o resto mapeia para `builtin`. |
| `serverId`   | `string` apenas quando `provenance === 'mcp'` | Extraído heuristicamente de `mcp__<serverId>__<tool>`.                                                                                                                    |

O nome de exibição `_meta.toolName` existente é preservado. A UI usa esses campos para renderizar badges de builtin / servidor MCP / subagent sem precisar reanalisar o nome da ferramenta.

## Comportamento do reducer do SDK

`reduceDaemonSessionEvent(state, evt)` em `packages/sdk-typescript/src/daemon/events.ts` projeta o stream em `DaemonSessionViewState`. Os campos relacionados à ressincronização são:

- **`awaitingResync: boolean`** - definido por `state_resync_required`; o chamador o limpa, tipicamente após `POST /session/:id/load` redefinir o estado de visualização.
- **`resyncRequiredCount: number`** - contador de observabilidade.
- **`lastResyncRequired?: DaemonStateResyncRequiredData`** - payload mais recente.

Enquanto `awaitingResync = true`, o reducer **ignora a aplicação de deltas** e permite apenas o conjunto fechado `RESYNC_PASSTHROUGH_TYPES`:

| Tipo de passthrough        | Por que ainda é aplicado durante a ressincronização                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| `state_resync_required` | Uma segunda ressincronização rara deve atualizar `lastResyncRequired` / `resyncRequiredCount`. |
| `session_died`          | O sinal de stream terminal deve permanecer visível durante a ressincronização.                      |
| `session_closed`        | Idem ao anterior.                                                                 |
| `client_evicted`        | Idem ao anterior.                                                                 |
| `stream_error`          | Idem ao anterior.                                                                 |
| `session_snapshot`      | Frame autoritativo de estado completo; seguro para aplicar durante a ressincronização.                   |

`lastEventId` ainda avança monotonicamente através de `advanceLastEventId(base)` durante a ressincronização. Após o chamador redefinir e limpar `awaitingResync`, os deltas subsequentes se alinham ao cursor correto.

`reduceDaemonAuthEvent` projeta eventos de fluxo de dispositivo em entradas de estado de autenticação no nível do workspace, conceitualmente moldadas como
`{deviceFlowId, status, providerId, expiresAt?, lastThrottleIntervalMs?, lastError?}`. No código, o reducer armazena `status`, `errorKind`, `hint`,
`intervalMs`, `lastSeenEventId`, `authorizedExpiresAt` e `accountAlias` em
`DaemonDeviceFlowReducerState`; os próprios payloads de evento do daemon permanecem com as formas por evento listadas acima.

## Estado e compatibilidade futura

- Adicione um tipo de evento conhecido anexando-o a `DAEMON_KNOWN_EVENT_TYPE_VALUES`. SDKs antigos retornam `undefined` para tipos de evento não reconhecidos através do caminho de fallback e incrementam `unrecognizedKnownEventCount`; SDKs novos dependem da união discriminada.
- Adicionar campos opcionais a um payload existente é seguro porque os payloads são abertos (`{ [key: string]: unknown }`).
- Alterar a **forma** de um payload existente é uma mudança quebrada (breaking change) e deve incrementar `EVENT_SCHEMA_VERSION`, além de anunciar uma tag de capacidade compatível, como `caps.features.typed_event_schema_v2`.
- `id` é monotônico por sessão. Frames sintéticos no nível do assinante (`client_evicted`, `slow_client_warning`, `stream_error`, `state_resync_required`, `replay_complete`, `session_snapshot`) intencionalmente não têm id para que outros assinantes não vejam lacunas.
- `originatorClientId` fica no envelope em vez de `data`. Payloads de votação parcial / proibidos do F3 também o mesclam em `data` através de `mergeOriginator`, para que os consumidores do estado de visualização não precisem reter o envelope.

## Dependências

- [`10-event-bus.md`](./10-event-bus.md) - canal de entrega.
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - como os SDKs fazem preflight de `typed_event_schema`, `mcp_guardrail_events` e `permission_mediation`.
- [`04-permission-mediation.md`](./04-permission-mediation.md) - como os eventos de permissão são produzidos.
- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - `asKnownDaemonEvent`, reducers e forma do estado de visualização.

## Configuração

- Sempre anunciados: `typed_event_schema`, `mcp_guardrail_events` e `permission_mediation` (com modos de política suportados).
- Nenhuma variável de ambiente ou flag controla diretamente o schema em si. `QWEN_SERVE_NO_MCP_POOL=1` altera o `scope` do evento MCP de `'workspace'` para ausente ou `'session'`.

## Ressalvas e limites conhecidos

- Seis tipos de frame sintéticos intencionalmente não têm `id`; o código do SDK não deve assumir que todo evento tem um id.
- `permission_partial_vote` só aparece sob `consensus`. `permission_forbidden` aparece sob `designated`, `consensus` e `local-only`, mas não sob `first-responder`.
- `mcp_child_refused_batch` só aparece em `mode: 'enforce'`; o modo `warn` nunca recusa.
- Eventos `auth_device_flow_*` não têm chave de sessão. Ao consumir através do `DaemonSessionClient`, use `reduceDaemonAuthEvent` para eles em vez do reducer de sessão.

## Referências

- `packages/sdk-typescript/src/daemon/events.ts`
- `packages/acp-bridge/src/eventBus.ts` (`EVENT_SCHEMA_VERSION`)
- `packages/cli/src/serve/capabilities.ts` (`typed_event_schema`, `mcp_guardrail_events`, `permission_mediation`)
- Referência de wire: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)