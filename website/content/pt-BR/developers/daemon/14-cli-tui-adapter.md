# Camada de Transcrição de UI Compartilhada

> **Status atual**: `packages/cli/src/ui/daemon/daemon-tui-adapter.ts` ainda está presente no `main` como um adaptador legado experimental do lado do CLI. Este documento descreve a nova camada de transcrição de UI compartilhada do lado do SDK: normalização de eventos do daemon reutilizável e primitivas de transcrição que qualquer host de UI pode consumir, incluindo canais Web, TUI, IDE e IM. As migrações do CLI TUI, channel e VS Code IDE são trabalhos subsequentes.

## Visão Geral

`packages/sdk-typescript/src/daemon/ui/` adiciona um subpacote `ui/*` ao SDK. Ele transforma o stream de eventos SSE do daemon em blocos de transcrição renderizáveis pela UI por meio de primitivas reutilizáveis:

- **Normalização** (`normalizer.ts`): mapeia os 47 tipos de eventos conhecidos do schema de wire do daemon (consulte [`09-event-schema.md`](./09-event-schema.md)) em 37 eventos semânticos `DaemonUiEventType` amigáveis à UI, como `assistant.text.delta`, `tool.update` e `session.metadata.changed`.
- **Máquina de estados** (`transcript.ts`, `store.ts`): reducer puro mais store assinável que projeta eventos de UI em um `DaemonTranscriptBlock[]` ordenado.
- **Renderizadores** (`render.ts`, `terminal.ts`, `toolPreview.ts`): blocos de transcrição para HTML, texto de terminal e strings de visualização de ferramentas. Os hosts podem usá-los ou substituí-los.
- **Conformidade** (`conformance.ts`): testes de consistência entre hosts usados quando as superfícies de channel, TUI e IDE migram para essas primitivas.

O primeiro consumidor em produção é o **`packages/webui/src/daemon/`** ([#4328](https://github.com/QwenLM/qwen-code/pull/4328)). Seu `DaemonSessionProvider` React e o adaptador de transcrição permitem que a UI web se conecte diretamente ao HTTP+SSE do daemon, em vez de renderizar apenas o tráfego `postMessage` do host. O CLI TUI, channel base e VS Code IDE podem reutilizar a mesma camada posteriormente; [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) documenta o guia de migração incremental v2.

## Responsabilidades

- Normalizar os 47 eventos de wire do daemon em um vocabulário de UI estável (`DaemonUiEventType`) para que os renderizadores não inspecionem `rawEvent.data`.
- Manter o `eventId` SSE monótono do daemon como a **chave de ordenação primária** para que diferentes clientes renderizem as transcrições na mesma ordem.
- Usar um reducer puro para produzir blocos de transcrição, com seletores para permissões pendentes, ferramenta atual, modo de aprovação, progresso da ferramenta e filhos de subagentes.
- Fornecer renderizadores base de HTML e terminal, permitindo ao mesmo tempo a renderização específica do host.
- Expor constantes públicas como `DAEMON_PLAN_TOOL_CALL_ID` para painéis de plano.
- Preservar a compatibilidade aditiva de wire: tipos de eventos desconhecidos são normalizados como `debug` em vez de serem descartados.

## Arquitetura

### Estrutura do pacote

| Arquivo                                            | Exportações                                                                                                                                                           | Propósito                     |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `packages/sdk-typescript/src/daemon/ui/index.ts` | Barrel do subpacote                                                                                                                                                 | Ponto de entrada público          |
| `ui/types.ts`                                    | `DaemonUiEventType`, interfaces `DaemonUiEvent*` por tipo, `DaemonTranscriptBlock`, `DaemonTranscriptState`, `DaemonUiToolProvenance`, `DAEMON_PLAN_TOOL_CALL_ID` | Tipos                       |
| `ui/normalizer.ts`                               | `normalizeDaemonEvent(evt) -> DaemonUiEvent`, `getSessionUpdatePayload(evt)`                                                                                      | Mapeamento de wire para UI          |
| `ui/transcript.ts`                               | `createDaemonTranscriptState()`, `appendLocalUserTranscriptMessage()`, `reduceDaemonTranscriptEvents()`, `rebuildDaemonTranscriptBlockIndex()`, seletores         | Máquina de estados e seletores |
| `ui/store.ts`                                    | `createDaemonTranscriptStore(initial?)`                                                                                                                           | Store de reducer assinável  |
| `ui/toolPreview.ts`                              | `createDaemonToolPreview(toolEvent)`                                                                                                                              | Texto de resumo de chamada de ferramenta      |
| `ui/render.ts`                                   | `DaemonHtmlRenderOptions`, `DaemonRenderOptions`, funções de renderização                                                                                                | Renderização HTML e genérica  |
| `ui/terminal.ts`                                 | Renderização específica de terminal                                                                                                                                       | Preparação de TUI             |
| `ui/conformance.ts`                              | Suíte de conformidade entre hosts                                                                                                                                      | Testes de paridade de migração      |
| `ui/utils.ts`                                    | Helpers como `DaemonUiContentPart`                                                                                                                             | Utilitários compartilhados internos   |

### Vocabulário de `DaemonUiEventType`

`ui/types.ts` define 37 tipos de eventos de UI, agrupados por domínio.

**Stream de chat (Estágio 1)**

- `user.text.delta`, `user.image.delta`, `user.shell.command`, `assistant.text.delta`, `assistant.done`, `thought.text.delta`
- `tool.update`, `shell.output`, `user.shell.output`
- `permission.request`, `permission.resolved`
- `model.changed`, `status`, `error`, `debug`

**Metadados da sessão**

- `session.metadata.changed`, `session.approval_mode.changed`
- `session.available_commands`, `session.state_resync_required`, `session.replay_complete`

**Ciclo de vida do prompt (entre clientes)**

- `prompt.cancelled`, `followup.suggestion`

**Workspace (Wave 3-4)**

- `workspace.memory.changed`, `workspace.agent.changed`
- `workspace.tool.toggled`, `workspace.settings.changed`, `workspace.initialized`
- `workspace.mcp.budget_warning`, `workspace.mcp.child_refused`
- `workspace.mcp.server_restarted`, `workspace.mcp.server_restart_refused`

**Fluxo de autenticação (Wave 4 OAuth)**

- `auth.device_flow.started`, `auth.device_flow.throttled`, `auth.device_flow.authorized`
- `auth.device_flow.failed`, `auth.device_flow.cancelled`

`normalizeDaemonEvent` mapeia os 47 eventos de wire conhecidos do daemon neste vocabulário. Tipos de eventos desconhecidos, não modelados ou malformados são normalizados como `debug` e preservam o `rawEvent` para diagnósticos do host.

### Reducer e seletores

```ts
// Cria o estado inicial.
const state = createDaemonTranscriptState();

// Aplica uma sequência de eventos SSE.
const next = reduceDaemonTranscriptEvents(state, daemonUiEvents);

// Seletores.
selectTranscriptBlocks(state); // todos os blocos
selectTranscriptBlocksOrderedByEventId(state); // ordenado por eventId; chave preferida
selectPendingPermissionBlocks(state);
selectCurrentTool(state);
selectApprovalMode(state);
selectToolProgress(state, toolCallId);
selectSubagentChildBlocks(state, parentBlockId);
isSubagentChildBlock(block);
formatBlockTimestamp(block);
formatMissedRange(state); // texto "você perdeu X" após state_resync_required
```

### Store

`createDaemonTranscriptStore()` fornece subscribe e dispatch:

```ts
const store = createDaemonTranscriptStore();
store.subscribe(() => render(store.getState()));
store.dispatch(uiEvents); // internamente executa o reducer
```

O `DaemonSessionProvider` da UI web constrói seu contexto React em cima desta store.

## Fluxo

### Evento SSE único de ponta a ponta

```mermaid
flowchart LR
    A["daemon SSE wire frame<br/>type=session_update / permission_request / ..."]
    A --> B["DaemonClient.subscribeEvents<br/>parseSseStream"]
    B --> C["asKnownDaemonEvent<br/>(09-event-schema.md)"]
    C --> D["normalizeDaemonEvent<br/>ui/normalizer.ts"]
    D --> E["DaemonUiEvent<br/>(37 UI-friendly types)"]
    E --> F["reduceDaemonTranscriptEvents<br/>ui/transcript.ts"]
    F --> G["DaemonTranscriptState +<br/>DaemonTranscriptBlock[]"]
    G --> H["renderer<br/>(render.ts HTML / terminal.ts / host custom)"]
    G --> I["selectors<br/>selectCurrentTool / selectApprovalMode / ..."]
```

Os hosts podem parar em `(E)` e implementar seu próprio reducer, ou consumir `(G)` e os seletores fornecidos. A UI web usa o caminho completo `(B) -> (H)`. Um TUI migrado pode consumir `(G)` e renderizar com componentes específicos do Ink.

### `state_resync_required`

`session.state_resync_required` mapeia para um marcador de "intervalo perdido" na transcrição. O código da UI pode chamar `formatMissedRange(state)` para renderizar textos como "eventos perdidos X-Y". O reducer **continua aplicando eventos posteriores**, mas marca os blocos afetados com `resyncRecovery: true` para que os renderizadores possam adicionar contexto visual. Consulte [`10-event-bus.md`](./10-event-bus.md) para as semânticas de ring-eviction e `state_resync_required`.

## Consumidores

### `packages/webui/src/daemon/`

Isso foi integrado no [#4328](https://github.com/QwenLM/qwen-code/pull/4328).

| Arquivo                        | Exportações                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DaemonSessionProvider.tsx` | React `<DaemonSessionProvider />`; hooks `useDaemonSession()`, `useDaemonTranscriptStore()`, `useDaemonTranscriptState()`, `useDaemonTranscriptBlocks()`, `useDaemonPendingPermissions()`, `useDaemonActions()`, `useDaemonConnection()`; tipos `DaemonConnectionStatus`, `DaemonConnectionState`, `DaemonSessionContextValue` |
| `transcriptAdapter.ts`      | Adapta o `DaemonTranscriptBlock` do SDK para o `UnifiedMessage` da UI web, incluindo mesclagem de chunks de streaming de markdown e resumos de chamadas de ferramentas                                                                                                                                                                                        |
| `index.ts`                  | Barrel do subpacote                                                                                                                                                                                                                                                                                                              |

A UI web agora pode se conectar diretamente ao HTTP+SSE do daemon e renderizar uma transcrição. O caminho antigo `postMessage` do host `ACPAdapter` permanece disponível.

### Migrações posteriores

[`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) fornece um guia incremental v2 para adaptadores de web chat e web terminal. Ele deixa explícito que **CLI TUI, channel base e VS Code IDE não são migrados por esse PR**; cada um será movido em PRs subsequentes e usará a suíte de conformidade para preservar a paridade de renderização.

## Relação com o legado `daemon-tui-adapter.ts`

| Dimensão         | `DaemonTuiAdapter` legado do CLI                                   | Nova camada de transcrição compartilhada                                    |
| ----------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| Pacote           | `packages/cli/src/ui/daemon/`                                   | `packages/sdk-typescript/src/daemon/ui/`                       |
| Superfície pública    | `DaemonTuiAdapter`, `DaemonTuiUpdate`, `DaemonTuiSessionClient` | `DaemonUiEventType`, `reduceDaemonTranscriptEvents`, seletores |
| Escopo             | Apenas CLI Ink TUI                                                | UI Web, TUI, IDE ou IM                                        |
| Forma do estado       | Union de atualização local do TUI                                          | Lista pura de blocos de transcrição mais campos de estado                   |
| Ordenação          | `createdAt`                                                     | `eventId` (monótono do daemon, consistente entre clientes)        |
| Tipo de wire desconhecido | Descartado em `reduceDaemonEventToTuiUpdates`                      | Normalizado como `debug` e preservado                            |
| Testes             | Testes unitários de pacote único                                       | Suíte de conformidade global para paridade entre hosts                 |

## Dependências

- Tipos de wire upstream: `packages/sdk-typescript/src/daemon/events.ts` (consulte [`09-event-schema.md`](./09-event-schema.md)).
- Consumidor downstream real: `packages/webui/src/daemon/`.
- Alvos de migração posteriores: `packages/cli/src/ui/`, `packages/channels/base/` e `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`.
- Referências paralelas: [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) e [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md).

## Configuração

- Sem configuração em tempo de execução. Reducers e seletores são funções puras.
- Os hosts escolhem seu renderizador: HTML (`render.ts`), terminal (`terminal.ts`) ou renderização personalizada.
- Para depuração, `render.ts` suporta `includeRawEvent: true` para incluir o wire frame bruto na saída renderizada.

## Ressalvas e limites conhecidos

- **`daemon-tui-adapter.ts` ainda existe**. É o adaptador experimental legado do pacote CLI. O novo código deve preferir o `ui/*` do SDK: `normalizeDaemonEvent`, `reduceDaemonTranscriptEvents` e `DaemonTranscriptBlock`.
- **CLI TUI, channel base e VS Code IDE ainda não foram migrados**. Eles ainda mantêm sua própria lógica de renderização. O diretório `docs/developers/daemon-client-adapters/` ainda contém `ide.md`, `channel-web.md` e o rascunho histórico `tui.md`; o `web-ui.md` mais recente cobre o design do adaptador de UI web.
- **`eventId` é a chave de ordenação primária**. `createdAt` permanece como um alias obsoleto (`clientReceivedAt`). O novo código deve usar `selectTranscriptBlocksOrderedByEventId(state)`. O `MIGRATION.md` mostra o diff de código para alternar da ordenação por `createdAt` para a ordenação por `eventId`.
- **Tipos de wire desconhecidos são normalizados como `debug`**. Eles não são mais descartados como no adaptador antigo. Os renderizadores não mostram `debug` por padrão; os hosts devem optar por exibi-lo.
- **Tamanho do bundle**: o subpacote `ui/*` é exportado como um subcaminho ESM através de `@qwen-code/sdk/daemon` e não puxa dependências do React ou DOM. A integração com React só é carregada quando um consumidor de UI web usa o `DaemonSessionProvider`.

## Referências

- `packages/sdk-typescript/src/daemon/ui/types.ts` (vocabulário `DaemonUiEventType`)
- `packages/sdk-typescript/src/daemon/ui/transcript.ts` (reducer e seletores)
- `packages/sdk-typescript/src/daemon/ui/normalizer.ts` (mapeamento de wire para UI)
- `packages/sdk-typescript/src/daemon/ui/store.ts`, `render.ts`, `terminal.ts`, `toolPreview.ts`, `conformance.ts`
- `packages/sdk-typescript/src/daemon/index.ts` (bloco de re-exportação `ui/*`)
- `packages/webui/src/daemon/DaemonSessionProvider.tsx`, `transcriptAdapter.ts`
- Docs upstream: [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)
- PRs de contexto: [#4328](https://github.com/QwenLM/qwen-code/pull/4328) (camada de transcrição v1 e provider de UI web), [#4353](https://github.com/QwenLM/qwen-code/pull/4353) (acompanhamento de completude unificada v2)