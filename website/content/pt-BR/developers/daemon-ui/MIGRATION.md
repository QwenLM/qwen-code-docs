# Migrando para o `@qwen-code/sdk/daemon` v2

A PR #4328 lançou a camada de UI do daemon v1. A PR #4353 (esta PR) lança a v2 com
sete commits de funcionalidades aditivas. Este guia orienta primeiro os autores
de adaptadores de web chat e web terminal. Mantenedores de TUI local nativo, canal e
IDE podem reutilizar os mesmos primitivos posteriormente, mas esses caminhos de
produto padrão não são migrados por esta PR.

## TL;DR para consumidores existentes

**Sem breaking changes.** Cada commit nesta PR é aditivo:

- Os campos da v1 continuam funcionando (`createdAt` preservado como alias `@deprecated` para
  `clientReceivedAt`)
- O normalizador da v1 ainda mapeia os mesmos 13 tipos de evento da mesma forma
- O reducer da v1 ainda produz os mesmos blocks para eventos de chat
- A nova API é opt-in via parâmetros adicionais e helpers

A PR é segura para merge sem qualquer alteração nos consumidores. **A adoção dos
novos recursos é incremental.**

## Ordem de adoção recomendada

Para cada adaptador, em ordem de relação esforço/valor:

### 1. Ordenação: alterar a chave de ordenação de `createdAt` para `eventId`

**Antes:**

```ts
const ordered = [...state.blocks].sort((a, b) => a.createdAt - b.createdAt);
```

**Depois:**

```ts
import { selectTranscriptBlocksOrderedByEventId } from '@qwen-code/sdk/daemon';
const ordered = selectTranscriptBlocksOrderedByEventId(state);
```

**Por que**: `eventId` é monotônico no daemon; sobrevive a replay-após-reconexão do SSE.
`createdAt` é do relógio do cliente e muda durante o replay.

### 2. Exibição: alterar `createdAt` para `serverTimestamp ?? clientReceivedAt`

**Antes:**

```tsx
<TimeLabel ms={block.createdAt} />
```

**Depois:**

```tsx
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';
<TimeLabel text={formatBlockTimestamp(block, { locale })} />;
```

**Por que**: Múltiplos clientes veem "X minutos atrás" consistente apenas quando ambos
leem o relógio do daemon. O renderizador mais `formatBlockTimestamp` lida com fuso horário +
locale.

**Nota**: O daemon precisa carimbar `_meta.serverTimestamp` nos envelopes para que
isso tenha efeito. SDK pronto para forward-compat; fallback para
`clientReceivedAt` até lá.

### 3. Ouvir novos tipos de evento — selecionar subconjunto para renderizar

Os 16 novos tipos de evento (session-meta, workspace, auth) não geram blocks de transcript.
São observações de canal lateral. Cada adaptador escolhe quais exibir:

```ts
// No seu consumidor SSE
const uiEvents = normalizeDaemonEvent(envelope, {
  clientId,
  suppressOwnUserEcho: true,
});
store.dispatch(uiEvents);

// Depois no lado da sua UI
for (const event of uiEvents) {
  switch (event.type) {
    case 'session.approval_mode.changed':
      myApprovalModeBadge.update(event.next);
      break;
    case 'workspace.mcp.budget_warning':
      myToast.show(
        `Servidores MCP se aproximando do orçamento: ${event.liveCount}/${event.budget}`,
      );
      break;
    case 'auth.device_flow.started':
      myAuthModal.show({
        deviceFlowId: event.deviceFlowId,
        providerId: event.providerId,
        expiresAt: event.expiresAt,
      });
      break;
    // ... etc, opte pelo que sua UI precisa
  }
}
```

Ou use selectors para canais laterais espelhados no estado:

```ts
import { selectApprovalMode, selectCurrentTool } from '@qwen-code/sdk/daemon';

const mode = selectApprovalMode(state); // espelhado de approval_mode.changed
const currentTool = selectCurrentTool(state); // ferramenta atual em andamento
```

### 4. Renderizar contrato: usar `daemonBlockToMarkdown` (ou HTML / plainText)

**Antes** (cada adaptador faz sua própria projeção):

```ts
function blockToString(block: DaemonTranscriptBlock): string {
  switch (block.kind) {
    case 'user':
      return `Você: ${block.text}`;
    case 'assistant':
      return block.text;
    case 'tool':
      return `[${block.title}]\n${block.status}`;
    // ... etc
  }
}
```

**Depois** (delegar ao SDK):

```ts
import { daemonBlockToMarkdown } from '@qwen-code/sdk/daemon';
const md = daemonBlockToMarkdown(block);
```

Para HTML SSR:

```ts
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
const html = DOMPurify.sanitize(md.render(daemonBlockToMarkdown(block)));
```

Para texto simples:

```ts
import { daemonBlockToPlainText } from '@qwen-code/sdk/daemon';
const plain = daemonBlockToPlainText(block);
```

### 5. Teste de conformidade

Adicione ao conjunto de testes do seu adaptador:

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('adaptador projeta corpus de UI do daemon corretamente', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReduce(events),
    renderToText: (state) => myRender(state),
  });
  expect(result.failed).toEqual([]);
});
```

Isso executará seu adaptador contra 10 cenários de fixture e identificará qualquer
desvio de projeção antes que chegue aos usuários.

### 6. Dispatch de ícone de ferramenta via `provenance`

**Antes** (casamento de string em toolName):

```tsx
const isMcp = toolName?.startsWith('mcp__');
const isBuiltin = ['Bash', 'Edit', 'Read'].includes(toolName);
```

**Depois** (provenance tipada da PR-A):

```tsx
import type { DaemonUiToolUpdateEvent } from '@qwen-code/sdk/daemon';

function toolIcon(event: DaemonUiToolUpdateEvent): React.ReactNode {
  switch (event.provenance) {
    case 'mcp':
      return <McpIcon server={event.serverId} />;
    case 'subagent':
      return <SubagentIcon />;
    case 'builtin':
      return <BuiltinIcon name={event.toolName} />;
    case 'unknown':
    default:
      return <GenericIcon />;
  }
}
```

O SDK tem uma heurística de fallback de nomenclatura `mcp__<server>__<tool>` — funciona hoje
mesmo quando o daemon não carimba provenance explicitamente.

### 7. Categorização de erro via `errorKind`

**Antes** (regex no texto):

```ts
if (error.text.includes('auth')) showAuthRetry();
else if (error.text.includes('file not found')) showFilePicker();
```

**Depois** (enum fechado da PR-A):

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';

function errorAction(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <RetryAuthButton />;
    case 'missing_file':   return <FilePicker />;
    case 'blocked_egress': return <CheckProxyHint />;
    case 'init_timeout':   return <RestartDaemonButton />;
    default:               return null;
  }
}
```

**Nota**: O daemon precisa carimbar `data.errorKind` em session_died /
stream_error para que isso seja preenchido. O SDK já lê.

### 8. Tratamento de cancelamento — já automático

Na v1, prompts cancelados deixavam tool blocks em andamento girando para sempre.
Na v2 (PR-E), `propagateCancellationToInFlightTools` é executado automaticamente
em `assistant.done.reason === 'cancelled'`. Filhos sub-agent são cancelados
junto com seu pai.

**Nenhuma alteração no adaptador é necessária** — seus spinners serão resolvidos corretamente.

### 8a. Aninhamento de sub-agent — opte pela renderização aninhada (PR-K)

Tool blocks invocados dentro de uma delegação sub-agent agora carregam
`parentToolCallId`, `subagentType` e (quando o pai está no estado)
`parentBlockId`. Adaptadores podem optar pela renderização aninhada:

**Antes** (lista plana, chamadas sub-agent visualmente indistinguíveis das
de nível superior):

```tsx
state.blocks.map((b) => <ToolBlock block={b} />);
```

**Depois** (renderização recursiva aninhada):

```tsx
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

function renderTool(block) {
  const children = selectSubagentChildBlocks(state, block.toolCallId);
  return (
    <ToolBlock block={block}>
      {block.subagentType && <SubagentBadge type={block.subagentType} />}
      {children.length > 0 && <Indent>{children.map(renderTool)}</Indent>}
    </ToolBlock>
  );
}

const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
return topLevel.map(renderTool);
```

**Nenhuma alteração no adaptador é necessária se você preferir a visualização plana** — os novos
campos são aditivos e ignorados pelo código que não os lê.

### 9. Taxonomia de preview de ferramenta — selecione subconjunto para renderizar com componentes personalizados

PR-D + PR-F trazem 13 tipos de preview:

- 4 em forma de arquivo: `file_diff`, `file_read`, `web_fetch`, `mcp_invocation`
- 5 em forma de conteúdo: `code_block`, `search`, `tabular`, `image_generation`, `subagent_delegation`
- 2 de controle: `ask_user_question`, `command`
- 2 genéricos: `key_value`, `generic`

Cada adaptador faz dispatch em `preview.kind`:

```tsx
function ToolPreviewComponent({ preview }: { preview: DaemonToolPreview }) {
  switch (preview.kind) {
    case 'file_diff':
      return (
        <UnifiedDiffView
          path={preview.path}
          old={preview.oldText}
          new={preview.newText}
        />
      );
    case 'mcp_invocation':
      return (
        <McpCard serverId={preview.serverId} toolName={preview.toolName} />
      );
    case 'tabular':
      return <DataTable columns={preview.columns} rows={preview.rows} />;
    case 'image_generation':
      return (
        <ImagePreview
          thumbnailUrl={preview.thumbnailUrl}
          prompt={preview.prompt}
        />
      );
    // ... ou fallback para:
    default:
      return <Markdown text={daemonToolPreviewToMarkdown(preview)} />;
  }
}
```

Adaptadores sem componentes personalizados para todos os 13 tipos podem usar fallback para o
`daemonToolPreviewToMarkdown` do SDK para qualquer tipo não tratado.

## Checklist de backward-compat

| Preocupação                                               | Status                                        |
| --------------------------------------------------------- | --------------------------------------------- |
| Leituras existentes de `block.createdAt`                  | ✅ ainda funciona (alias para `clientReceivedAt`) |
| Tratamento de eventos existente no reducer                | ✅ inalterado para tipos de evento da v1      |
| Locais de chamada `daemonTranscriptToUnifiedMessages(blocks)` | ✅ novo parâmetro opcional é opcional         |
| Consumidores existentes de `selectTranscriptBlocks`       | ✅ inalterado                                 |
| Novos tipos de evento no reducer da v1                    | ✅ no-op, `lastEventId` ainda avança          |

## Referências cruzadas

- [PR #4353 SUMMARY](https://github.com/QwenLM/qwen-code/pull/4353)
- [README da UI do Daemon](./README.md) — referência completa da API
- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — PR base com camada de transcript de UI compartilhada