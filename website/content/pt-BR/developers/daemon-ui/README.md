# SDK de UI do Daemon — Guia do Desenvolvedor

O subcaminho `@qwen-code/sdk/daemon` fornece primitivas de UI compartilhadas para clientes
do daemon. O alvo de adoção atual são web chat e web terminal; integrações nativas com
TUI local, canal e IDE mantêm seus caminhos padrão existentes enquanto o contrato
de UI do daemon se estabiliza. Este guia cobre a superfície de API introduzida pela
PR #4353 (a sequência unificada da camada de transcrição de UI compartilhada da PR #4328).

## Modelo de três camadas

```
Conexão SSE do Daemon (envelopes NDJSON)
   │
   ▼
normalizeDaemonEvent(envelope) → DaemonUiEvent[]
   │
   ▼
reduceDaemonTranscriptEvents(state, events) → DaemonTranscriptState
   │                                            { blocks, currentToolCallId,
   │                                              approvalMode, toolProgress, ... }
   ▼
daemonBlockToMarkdown(block) / ToHtml / ToPlainText  ← seu renderizador se conecta aqui
```

- **Normalizador**: recebe envelopes SSE brutos do daemon, retorna eventos de UI tipados
- **Redutor**: acumula eventos em uma máquina de estados de transcrição
- **Auxiliares de renderização**: projetam blocos de estado em strings renderizáveis

## Início rápido

```ts
import {
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
  daemonBlockToMarkdown,
  selectCurrentTool,
  selectApprovalMode,
} from '@qwen-code/sdk/daemon';

const session = await DaemonSessionClient.createOrAttach(client, {
  workspaceCwd,
});
const store = createDaemonTranscriptStore();

for await (const envelope of session.events({ signal })) {
  const events = normalizeDaemonEvent(envelope, {
    clientId: session.clientId,
    suppressOwnUserEcho: true,
  });
  store.dispatch(events);
}

// Lê o estado de qualquer inscrito
store.subscribe(() => {
  const state = store.getSnapshot();
  const currentTool = selectCurrentTool(state);
  const mode = selectApprovalMode(state);
  const markdown = state.blocks.map(daemonBlockToMarkdown).join('\n\n');
  myRenderer.render({ markdown, currentTool, mode });
});
```

## Taxonomia de eventos (28+ tipos)

`DaemonUiEvent` é uma união discriminada de todos os eventos voltados para UI:

### Eventos de chat-stream

| Evento                        | Quando                                                |
| ---------------------------- | ----------------------------------------------------- |
| `user.text.delta`            | Fragmento de mensagem do usuário chega do daemon      |
| `assistant.text.delta`       | Fragmento de streaming do assistente                  |
| `assistant.done`             | Conclusão do prompt (da resolução de sendPrompt)      |
| `thought.text.delta`         | Fragmento de raciocínio do agente                     |
| `tool.update`                | Ciclo de vida da chamada de ferramenta (executando / concluída / cancelada) |
| `shell.output`               | Fragmento de stdout/stderr da ferramenta shell        |
| `permission.request`         | Ferramenta precisa de autorização do usuário          |
| `permission.resolved`        | Decisão de permissão chegou                           |
| `model.changed`              | Modelo da sessão alterado                             |
| `status` / `debug` / `error` | Blocos de status / debug / erro                       |

### Eventos de metadados da sessão (PR-A)

| Evento                           | Quando                                            |
| ------------------------------- | ------------------------------------------------ |
| `session.metadata.changed`      | Título da sessão / nome de exibição atualizado    |
| `session.approval_mode.changed` | Modo alternado (plan / default / yolo / auto-edit) |
| `session.available_commands`    | Lista de comandos de barra atualizada             |

### Eventos do workspace (PR-A, Onda 3-4)

| Evento                                  | Quando                                  |
| -------------------------------------- | ------------------------------------- |
| `workspace.memory.changed`             | QWEN.md / arquivo de memória modificado |
| `workspace.agent.changed`              | Subagente criado / atualizado / excluído |
| `workspace.tool.toggled`               | Ferramenta nativa ativada / desativada  |
| `workspace.initialized`                | `qwen init` concluído                  |
| `workspace.mcp.budget_warning`         | Contagem de filhos MCP se aproximando do limite |
| `workspace.mcp.child_refused`          | Servidor MCP recusado devido ao orçamento |
| `workspace.mcp.server_restarted`       | Reinicialização manual do MCP bem-sucedida |
| `workspace.mcp.server_restart_refused` | Reinicialização manual bloqueada        |

### Eventos de fluxo de dispositivo de autenticação (PR-A, Onda 4 OAuth)

`auth.device_flow.{started,throttled,authorized,failed,cancelled}`

Cada um carrega o `deviceFlowId` do daemon. Eventos de falha carregam um
`errorKind` de enumeração fechada (veja `KNOWN_DEVICE_FLOW_ERROR_KINDS` exportado de
`@qwen-code/sdk/daemon` para a lista canônica, atualmente: `expired_token` / `access_denied` / `invalid_grant` / `upstream_error` / `persist_failed` / `not_found_or_evicted`).

## Contrato de renderização (PR-D)

Três auxiliares de projeção, um auxiliar de pré-visualização. Todos discriminam com base em `block.kind`
ou `preview.kind`:

```ts
daemonBlockToMarkdown(block, { sanitizeUrls?, maxFieldLength?, locale? })
daemonBlockToHtml(block, { sanitizer?, ...renderOpts })
daemonBlockToPlainText(block, renderOpts)
daemonToolPreviewToMarkdown(preview, renderOpts)
```

### Guia prático: renderizar uma transcrição para markdown

```ts
const markdown = state.blocks
  .map((b) => daemonBlockToMarkdown(b, { sanitizeUrls: true }))
  .join('\n\n');
```

### Guia prático: renderizar para HTML sanitizado para SSR

```ts
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();

const html = state.blocks
  .map((b) => {
    // Pipeline de dois estágios: markdown → HTML → DOMPurify
    const rawHtml = md.render(daemonBlockToMarkdown(b));
    return DOMPurify.sanitize(rawHtml);
  })
  .join('\n');
```

Ou use o renderizador HTML conservador embutido (sem parsing markdown, apenas
escape HTML):

```ts
const html = state.blocks
  .map((b) => daemonBlockToHtml(b, { sanitizer: DOMPurify.sanitize }))
  .join('\n');
```

### Guia prático: copiar-colar texto simples

```ts
const plain = state.blocks.map(daemonBlockToPlainText).join('\n');
navigator.clipboard.writeText(plain);
```

## Taxonomia de pré-visualização de ferramentas (13 tipos)

| Tipo                  | Superfície                                         |
| --------------------- | ------------------------------------------------- |
| `ask_user_question`   | Pergunta de múltipla escolha com opções            |
| `command`             | Comando estilo Bash + cwd                         |
| `file_diff`           | Edição de arquivo com oldText/newText ou patch     |
| `file_read`           | Caminho + intervalo de linhas opcional             |
| `web_fetch`           | URL + método HTTP                                 |
| `mcp_invocation`      | Servidor MCP + ferramenta + resumo de argumentos   |
| `code_block`          | Trecho de código com tag de linguagem              |
| `search`              | Consulta + contagem de resultados + principais resultados |
| `tabular`             | Colunas + linhas (limitado a 50, truncamento sinalizado) |
| `image_generation`    | Prompt + URL de miniatura opcional                 |
| `subagent_delegation` | Nome do agente + tarefa                            |
| `key_value`           | Linhas genéricas de rótulo/valor                   |
| `generic`             | Resumo de fallback                                |

Cada um tem uma projeção `daemonToolPreviewToMarkdown`. Renderizadores personalizados podem
despachar com base em `preview.kind` para exibição rica por tipo (diff de arquivo com
destaque de sintaxe, selo de servidor MCP, miniatura de imagem, etc.).

## Seletores de estado (PR-E)

```ts
selectCurrentTool(state); // → DaemonToolTranscriptBlock | undefined
selectApprovalMode(state); // → 'plan' | 'default' | 'auto-edit' | 'yolo' | undefined
selectToolProgress(state, toolCallId); // → { ratio?, step? } | undefined
selectPendingPermissionBlocks(state); // → ReadonlyArray<DaemonPermissionTranscriptBlock>
selectTranscriptBlocks(state); // → ReadonlyArray<DaemonTranscriptBlock>
selectTranscriptBlocksOrderedByEventId(state); // ordenado por id monotônico do daemon

// PR-K — aninhamento de subagentes
selectSubagentChildBlocks(state, parentToolCallId); // apenas filhos diretos
isSubagentChildBlock(block); // guarda de tipo: esta ferramenta foi invocada dentro de um subagente?
```

`currentToolCallId` é mantido automaticamente pelo redutor:

- Definido quando uma ferramenta entra em status de execução (`running` / `in_progress` / `pending` / `confirming`)
- Limpo quando a ferramenta entra em status terminal (`completed` / `failed` / `cancelled` / etc.)
- Status desconhecidos não o alteram (compatibilidade futura)

## Propagação de cancelamento (PR-E)

Quando `assistant.done.reason === 'cancelled'`, o redutor percorre cada
bloco de ferramenta em execução e força seu status para `'cancelled'`. O daemon
não garante um `tool_call_update` terminal para cada ferramenta em execução
quando o prompt pai é cancelado — esta propagação evita que spinners de UI
girem para sempre.

Os filhos de subagentes são cancelados junto com seu pai porque
o cancelamento itera sobre cada bloco de ferramenta em execução em `toolBlockByCallId`,
não apenas o ponteiro atual.

## Aninhamento de subagentes (PR-K)

Quando o agente principal delega a um subagente (a ferramenta `Task`, ou
equivalente), o daemon carimba `parentToolCallId` e `subagentType` nas
chamadas de ferramenta **filhas** via `tool_call._meta`. O redutor lê ambos
e:

- Espelha `parentToolCallId` + `subagentType` em
  `DaemonToolTranscriptBlock`
- Resolve `parentBlockId` (o `id` do bloco de transcrição pai) quando o bloco
  pai já está no estado; caso contrário, deixa como `undefined` e
  preenche retroativamente quando o bloco pai aparecer depois

A chegada fora de ordem (filho antes do pai) é tratada de forma transparente. Um
filho cujo pai é removido por `maxBlocks` mantém `parentToolCallId`
para consultas de seletor, mas `parentBlockId` é anulado (o id órfão
não seria mais resolvido via `blockIndexById`).

```ts
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

// Renderiza um bloco de ferramenta pai, depois percorre os filhos:
function renderToolBlock(state, block) {
  if (block.kind !== 'tool') return renderOther(block);
  const children = selectSubagentChildBlocks(state, block.toolCallId);
  return (
    <ToolBlock block={block}>
      {children.length > 0 && (
        <Indent>
          {children.map((c) => renderToolBlock(state, c))}
        </Indent>
      )}
    </ToolBlock>
  );
}

// Ou filtra nível superior vs. aninhado no momento da renderização:
const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
```

`selectSubagentChildBlocks` retorna apenas filhos **diretos**. Percorra
recursivamente para renderizar subagentes aninhados (um subagente dentro de um
subagente). O daemon não emite ciclos, mas renderizadores que sobem via
`parentBlockId` ainda devem detectá-los defensivamente (por exemplo, limite de profundidade ou
conjunto de visitados).

Autorreferências (`parentToolCallId === toolCallId`) são descartadas pelo
normalizador antes de chegar ao redutor.

## Semântica de tempo (PR-B)

```ts
interface DaemonTranscriptBlockBase {
  eventId?: number; // Chave de ordenação PRIMÁRIA — monotônico do daemon
  serverTimestamp?: number; // Exibição PREFERIDA — autoritativo do daemon
  clientReceivedAt: number; // FALLBACK — relógio local
  createdAt: number; // @deprecated alias para clientReceivedAt
}
```

**Sempre ordene por `eventId`** (use `selectTranscriptBlocksOrderedByEventId`)
ao exibir sessões longas. O cursor monotônico do daemon é preservado
através de repetição SSE após reconexão; relógios de cliente não.

**Sempre formate timestamps de exibição a partir de `serverTimestamp`** (com
fallback para `clientReceivedAt`). Vários clientes visualizando a mesma sessão
veem o mesmo "5 minutos atrás" apenas quando ambos leem do relógio do daemon.

```ts
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';

const label = formatBlockTimestamp(block, {
  locale: 'pt-BR',
  timeZone: 'America/Sao_Paulo',
  timeStyle: 'short',
});
```

## Conformidade de adaptadores (PR-G)

Valide que seu adaptador projeta o corpus de referência do SDK para uma saída
semanticamente equivalente:

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('meu adaptador está em conformidade com o corpus de UI do daemon', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReducer(events),
    renderToText: (state) => myRenderer(state),
  });
  expect(result.failed).toEqual([]);
});
```

O corpus de fixtures (`DAEMON_UI_CONFORMANCE_FIXTURES`) cobre chat, ciclo de vida
de ferramentas, edições de arquivo, MCP, permissões, aviso de orçamento MCP, cancelamento,
redação de payload malformado, OAuth, atualizações de comando e aninhamento
de subagentes. (A contagem é derivável em tempo de execução — leia
`DAEMON_UI_CONFORMANCE_FIXTURES.length`.)

**Agnóstico a formato** — seu adaptador pode renderizar para ANSI / HTML / markdown /
JSX; a estrutura verifica apenas o conteúdo semântico via `expectedContains` e
`expectedAbsent`.

## Categorização de erros (PR-A)

`DaemonUiErrorEvent.errorKind` é uma enumeração fechada propagada da
taxonomia de erros tipados do daemon (quando o daemon a carimba):

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';
// 'missing_binary' | 'blocked_egress' | 'auth_env_error' | 'init_timeout'
// | 'protocol_error' | 'missing_file' | 'parse_error' | 'budget_exhausted'
```

Renderizadores devem ramificar com base em `errorKind` para ações sugeridas acionáveis:

```ts
function errorAffordance(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <button>Reautenticar</button>;
    case 'missing_file':   return <button>Escolher arquivo</button>;
    case 'blocked_egress': return <span>Rede bloqueada — verifique proxy</span>;
    default:               return null;
  }
}
```

## Despacho de proveniência de ferramenta (PR-A)

`DaemonUiToolUpdateEvent.provenance` é uma enumeração fechada (`builtin` / `mcp` /
`subagent` / `unknown`). Com `serverId?: string` quando `mcp`. Use para
despacho de ícones e badges:

```ts
function toolIcon(event: DaemonUiToolUpdateEvent): React.ReactNode {
  switch (event.provenance) {
    case 'mcp':      return <McpIcon server={event.serverId} />;
    case 'subagent': return <SubagentIcon />;
    case 'builtin':  return <BuiltinIcon name={event.toolName} />;
    default:         return <GenericIcon />;
  }
}
```

O SDK tem uma heurística de fallback de nomenclatura `mcp__<server>__<tool>` — mesmo
quando o daemon não carimba explicitamente a proveniência, ferramentas MCP são detectáveis.

## Princípios de compatibilidade futura

Cada camada no SDK de UI do daemon segue o **princípio de compatibilidade futura**:
valores desconhecidos NÃO lançam exceções; eles degradam graciosamente.

- Tipos de evento do daemon desconhecidos → evento `debug` com o nome do tipo bruto
- Status de ferramenta desconhecido → `currentToolCallId` não alterado (sem limpeza)
- Tipo de erro desconhecido → `errorKind` undefined (renderizador cai para texto)
- serverTimestamp ausente → cai para `clientReceivedAt`
- Formato de pré-visualização não reconhecido → tipo `generic` com `summary`

Isso significa que o **SDK pode ser lançado antes da emissão do daemon**. A heurística
de proveniência de ferramenta da PR-A, a extração de timestamp de três locais da PR-B, e
a preservação de status desconhecido da PR-E são todos exemplos de "pronto quando o daemon
enviar; seguro quando não enviar."

## Referências cruzadas

- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — PR base com a camada de transcrição de UI compartilhada
- [PR #4353](https://github.com/QwenLM/qwen-code/pull/4353) — esta PR (sequência unificada de completude)
- [Issue #3803](https://github.com/QwenLM/qwen-code/issues/3803) — proposta de modo daemon
- [Issue #4175](https://github.com/QwenLM/qwen-code/issues/4175) — rastreador de implementação do Modo B v0.16