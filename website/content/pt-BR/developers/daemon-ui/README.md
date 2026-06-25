# Guia do Desenvolvedor — SDK de UI do Daemon

O submódulo `@qwen-code/sdk/daemon` fornece primitivos de UI compartilhados para
clientes do daemon. O alvo de adoção atual é chat web e terminal web;
integrações nativas de TUI local, canal e IDE mantêm seus caminhos padrão
existentes enquanto o contrato de UI do daemon se estabiliza. Este guia cobre a
superfície da API introduzida pelo PR #4353 (a sequência unificada da camada de
transcrição de UI compartilhada do PR #4328).

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

- **Normalizador**: pega envelopes SSE brutos do daemon, retorna eventos de UI tipados
- **Redutor**: acumula eventos em uma máquina de estados da transcrição
- **Auxiliares de renderização**: projetam blocos de estado para strings renderizáveis

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

// Leia o estado de qualquer assinante
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

### Eventos de fluxo de chat

| Evento                        | Quando                                                |
| ----------------------------- | ----------------------------------------------------- |
| `user.text.delta`            | Fragmento da mensagem do usuário chega do daemon      |
| `assistant.text.delta`       | Fragmento do streaming do assistente                  |
| `assistant.done`             | Conclusão do prompt (da resolução de sendPrompt)      |
| `thought.text.delta`         | Fragmento de raciocínio do agente                     |
| `tool.update`                | Ciclo de vida da chamada de ferramenta (executando / concluída / cancelada) |
| `shell.output`               | Fragmento de stdout/stderr da ferramenta shell        |
| `permission.request`         | Ferramenta precisa de autorização do usuário          |
| `permission.resolved`        | Decisão de permissão chegou                           |
| `model.changed`              | Modelo da sessão alterado                             |
| `status` / `debug` / `error` | Blocos de status / depuração / erro                   |

### Eventos de metadados da sessão (PR-A)

| Evento                           | Quando                                             |
| -------------------------------- | -------------------------------------------------- |
| `session.metadata.changed`      | Título / nome de exibição da sessão atualizado     |
| `session.approval_mode.changed` | Modo alternado (plan / default / yolo / auto-edit) |
| `session.available_commands`    | Lista de comandos de barra recarregada             |

### Eventos do workspace (PR-A, Wave 3-4)

| Evento                                  | Quando                                  |
| --------------------------------------- | --------------------------------------- |
| `workspace.memory.changed`             | QWEN.md / arquivo de memória modificado |
| `workspace.agent.changed`              | Subagente criado / atualizado / excluído |
| `workspace.tool.toggled`               | Ferramenta embutida ativada / desativada |
| `workspace.initialized`                | `qwen init` concluído                   |
| `workspace.mcp.budget_warning`         | Contagem de filhos MCP se aproximando do limite |
| `workspace.mcp.child_refused`          | Servidor MCP recusado devido ao orçamento |
| `workspace.mcp.server_restarted`       | Reinicialização manual do MCP bem-sucedida |
| `workspace.mcp.server_restart_refused` | Reinicialização manual bloqueada         |

### Eventos de fluxo de dispositivo de autenticação (PR-A, Wave 4 OAuth)

`auth.device_flow.{started,throttled,authorized,failed,cancelled}`

Cada um carrega o `deviceFlowId` do daemon. Eventos com falha carregam um
`errorKind` de enumeração fechada (enum fechada — consulte
`KNOWN_DEVICE_FLOW_ERROR_KINDS` exportado de `@qwen-code/sdk/daemon` para a lista
canônica, atualmente: `expired_token` / `access_denied` / `invalid_grant` /
`upstream_error` / `persist_failed` / `not_found_or_evicted`).

## Contrato de renderização (PR-D)

Três auxiliares de projeção, um auxiliar de pré-visualização. Todos discriminam
em `block.kind` ou `preview.kind`:
```ts
daemonBlockToMarkdown(block, { sanitizeUrls?, maxFieldLength?, locale? })
daemonBlockToHtml(block, { sanitizer?, ...renderOpts })
daemonBlockToPlainText(block, renderOpts)
daemonToolPreviewToMarkdown(preview, renderOpts)
```

### Cookbook: renderizar um transcript para markdown

```ts
const markdown = state.blocks
  .map((b) => daemonBlockToMarkdown(b, { sanitizeUrls: true }))
  .join('\n\n');
```

### Cookbook: renderizar para HTML sanitizado para SSR

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

Ou use o renderizador HTML conservador embutido (sem parsing de markdown, apenas escape HTML):

```ts
const html = state.blocks
  .map((b) => daemonBlockToHtml(b, { sanitizer: DOMPurify.sanitize }))
  .join('\n');
```

### Cookbook: copiar e colar texto simples

```ts
const plain = state.blocks.map(daemonBlockToPlainText).join('\n');
navigator.clipboard.writeText(plain);
```

## Taxonomia de pré-visualização de ferramentas (13 tipos)

| Tipo                  | Exibição                                           |
| --------------------- | -------------------------------------------------- |
| `ask_user_question`   | Pergunta de múltipla escolha com opções            |
| `command`             | Comando no estilo Bash + diretório atual           |
| `file_diff`           | Edição de arquivo com oldText/newText ou patch     |
| `file_read`           | Caminho + intervalo de linhas opcional             |
| `web_fetch`           | URL + método HTTP                                  |
| `mcp_invocation`      | Servidor MCP + ferramenta + resumo de argumentos   |
| `code_block`          | Trecho de código com tag de linguagem              |
| `search`              | Consulta + quantidade de resultados + principais resultados |
| `tabular`             | Colunas + linhas (limitado a 50, truncamento sinalizado) |
| `image_generation`    | Prompt + URL de miniatura opcional                 |
| `subagent_delegation` | Nome do agente + tarefa                            |
| `key_value`           | Linhas genéricas de rótulo/valor                   |
| `generic`             | Resumo de fallback                                 |

Cada um possui uma projeção `daemonToolPreviewToMarkdown`. Renderizadores personalizados podem despachar com base em `preview.kind` para exibição rica por tipo (diff de arquivo com realce de sintaxe, badge de servidor MCP, miniatura de imagem, etc.).

## Seletores de estado (PR-E)

```ts
selectCurrentTool(state); // → DaemonToolTranscriptBlock | undefined
selectApprovalMode(state); // → 'plan' | 'default' | 'auto-edit' | 'yolo' | undefined
selectToolProgress(state, toolCallId); // → { ratio?, step? } | undefined
selectPendingPermissionBlocks(state); // → ReadonlyArray<DaemonPermissionTranscriptBlock>
selectTranscriptBlocks(state); // → ReadonlyArray<DaemonTranscriptBlock>
selectTranscriptBlocksOrderedByEventId(state); // sorted by daemon-monotonic id

// PR-K — sub-agent nesting
selectSubagentChildBlocks(state, parentToolCallId); // direct children only
isSubagentChildBlock(block); // type guard: was this tool invoked inside a sub-agent?
```

`currentToolCallId` é mantido automaticamente pelo reducer:

- Definido quando uma ferramenta entra em status em andamento (`running` / `in_progress` / `pending` / `confirming`)
- Limpo quando a ferramenta entra em status terminal (`completed` / `failed` / `cancelled` / etc.)
- Status desconhecidos deixam intacto (compatível com versões futuras)

## Propagação de cancelamento (PR-E)

Quando `assistant.done.reason === 'cancelled'`, o reducer percorre todos os blocos de ferramenta em andamento e força a definição de seu status para `'cancelled'`. O Daemon não garante um `tool_call_update` terminal para toda ferramenta em andamento quando o prompt pai é cancelado — essa propagação evita que spinners da UI girem para sempre.

Filhos de subagentes são cancelados junto com seu pai porque o cancelamento itera sobre todos os blocos de ferramenta em andamento em `toolBlockByCallId`, não apenas o ponteiro atual.

## Aninhamento de subagentes (PR-K)

Quando o agente principal delega para um subagente (a ferramenta `Task`, ou equivalente), o daemon carimba `parentToolCallId` e `subagentType` nas chamadas de ferramenta **filhas** através de `tool_call._meta`. O reducer lê ambos e:

- Espelha `parentToolCallId` + `subagentType` em `DaemonToolTranscriptBlock`
- Resolve `parentBlockId` (o `id` do bloco de transcript pai) quando o bloco pai já está no estado; caso contrário, deixa como `undefined` e preenche posteriormente quando o bloco pai aparecer

Chegada fora de ordem (filho antes do pai) é tratada de forma transparente. Um filho cujo pai foi removido por `maxBlocks` mantém `parentToolCallId` para consultas em seletores, mas `parentBlockId` é anulado (o id pendente não resolveria mais via `blockIndexById`).

```ts
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

// Render a parent tool block, then walk children:
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

// Or filter top-level vs. nested at render time:
const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
```
`selectSubagentChildBlocks` retorna apenas filhos **diretos**. Para renderizar subagentes aninhados (um subagente dentro de outro subagente), é necessário percorrer recursivamente. O daemon não emite ciclos, mas os renderizadores que navegam para cima via `parentBlockId` ainda devem detectá-los defensivamente (por exemplo, limite de profundidade ou conjunto de visitados).

Autorreferências (`parentToolCallId === toolCallId`) são descartadas pelo normalizador antes de chegarem ao redutor.

## Semânticas de tempo (PR-B)

```ts
interface DaemonTranscriptBlockBase {
  eventId?: number; // PRIMARY sort key — daemon-monotonic
  serverTimestamp?: number; // PREFERRED display — daemon-authoritative
  clientReceivedAt: number; // FALLBACK — local clock
  createdAt: number; // @deprecated alias for clientReceivedAt
}
```

**Sempre ordene por `eventId`** (use `selectTranscriptBlocksOrderedByEventId`) ao exibir sessões longas. O cursor monotônico do daemon é preservado durante a reprodução SSE após reconexão; os relógios do cliente não.

**Sempre formate os timestamps de exibição a partir de `serverTimestamp`** (com fallback para `clientReceivedAt`). Múltiplos clientes visualizando a mesma sessão veem o mesmo "5 minutos atrás" apenas quando ambos leem a partir do relógio do daemon.

```ts
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';

const label = formatBlockTimestamp(block, {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeStyle: 'short',
});
```

## Conformidade do adaptador (PR-G)

Valide se seu adaptador projeta o corpus de referência do SDK para uma saída semanticamente equivalente:

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('meu adaptador está em conformidade com o corpus da UI do daemon', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReducer(events),
    renderToText: (state) => myRenderer(state),
  });
  expect(result.failed).toEqual([]);
});
```

O corpus de fixtures (`DAEMON_UI_CONFORMANCE_FIXTURES`) cobre chat, ciclo de vida de ferramentas, edições de arquivos, MCP, permissões, aviso de orçamento MCP, cancelamento, redação de payload malformado, OAuth, atualizações de comando e aninhamento de subagentes. (A contagem é derivável em tempo de execução — leia `DAEMON_UI_CONFORMANCE_FIXTURES.length`.)

**Independente de formato** — seu adaptador pode renderizar em ANSI / HTML / markdown / JSX; o framework apenas verifica o conteúdo semântico através de `expectedContains` e `expectedAbsent`.

## Categorização de erros (PR-A)

`DaemonUiErrorEvent.errorKind` é uma enumeração fechada propagada a partir da taxonomia de erros tipados do daemon (quando o daemon a rotula):

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';
// 'missing_binary' | 'blocked_egress' | 'auth_env_error' | 'init_timeout'
// | 'protocol_error' | 'missing_file' | 'parse_error' | 'budget_exhausted'
```

Os renderizadores devem ramificar com base em `errorKind` para affordances acionáveis:

```ts
function errorAffordance(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <button>Reautenticar</button>;
    case 'missing_file':   return <button>Escolher arquivo</button>;
    case 'blocked_egress': return <span>Rede bloqueada — verifique o proxy</span>;
    default:               return null;
  }
}
```

## Distribuição de proveniência de ferramentas (PR-A)

`DaemonUiToolUpdateEvent.provenance` é uma enumeração fechada (`builtin` / `mcp` / `subagent` / `unknown`). Com `serverId?: string` quando `mcp`. Use-a para distribuição de ícones e badging:

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

O SDK possui uma heurística de nomenclatura `mcp__<server>__<tool>` como fallback — mesmo quando o daemon não rotula explicitamente a proveniência, ferramentas MCP são detectáveis.

## Princípios de compatibilidade futura

Toda camada no SDK da UI do daemon segue o **princípio de compatibilidade futura**: valores desconhecidos NÃO lançam exceções; eles degradam graciosamente.

- Tipos de evento desconhecidos do daemon → evento `debug` com o nome do tipo bruto
- Status de ferramenta desconhecido → `currentToolCallId` permanece intocado (sem limpeza)
- Tipo de erro desconhecido → `errorKind` indefinido (renderizador recai para texto)
- serverTimestamp ausente → recai para `clientReceivedAt`
- Forma de pré-visualização não reconhecida → tipo `generic` com `summary`

Isso significa que **o SDK pode ser lançado antes da emissão do daemon**. A heurística de proveniência de ferramentas do PR-A, a extração de timestamp em três locais do PR-B e a preservação de status desconhecido do PR-E são todos exemplos de "pronto quando o daemon envia; seguro quando não envia".

## Referências cruzadas

- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — PR base com a camada de transcrição compartilhada da UI
- [PR #4353](https://github.com/QwenLM/qwen-code/pull/4353) — este PR (acompanhamento de completude unificada)
- [Issue #3803](https://github.com/QwenLM/qwen-code/issues/3803) — proposta de modo daemon
- [Issue #4175](https://github.com/QwenLM/qwen-code/issues/4175) — rastreador de implementação do Modo B v0.16
