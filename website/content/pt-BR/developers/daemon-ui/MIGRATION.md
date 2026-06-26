# Migrando para `@qwen-code/sdk/daemon` v2

O PR #4328 lançou a camada de UI do daemon v1. O PR #4353 (este PR) lança a v2 com
sete commits de funcionalidades aditivas. Este guia aborda as mudanças primeiro para
autores de adaptadores de web chat e web terminal. Mantenedores de TUI local nativa, canal e IDE
podem reutilizar os mesmos primitivos depois, mas esses caminhos de produto padrão
não são migrados por este PR.

## TL;DR para consumidores existentes

**Sem mudanças de quebra.** Cada commit neste PR é aditivo:

- Campos v1 ainda funcionam (`createdAt` preservado como alias `@deprecated` para
  `clientReceivedAt`)
- O normalizador v1 ainda mapeia os mesmos 13 tipos de evento da mesma forma
- O redutor v1 ainda produz os mesmos blocos para eventos de chat
- A nova API é opt-in via parâmetros adicionais e auxiliares

O PR é seguro para mesclar sem nenhuma alteração no consumidor. **A adoção dos
novos recursos é incremental.**

## Ordem de adoção recomendada

Para cada adaptador, na ordem de relação esforço/valor:

### 1. Ordenação: altere a chave de ordenação de `createdAt` para `eventId`

**Antes:**

```ts
const ordered = [...state.blocks].sort((a, b) => a.createdAt - b.createdAt);
```

**Depois:**

```ts
import { selectTranscriptBlocksOrderedByEventId } from '@qwen-code/sdk/daemon';
const ordered = selectTranscriptBlocksOrderedByEventId(state);
```

**Por que**: `eventId` é monotônico ao daemon; sobrevive a replay após reconexão SSE.
`createdAt` é do relógio do cliente e muda durante replay.

### 2. Exibição: altere `createdAt` para `serverTimestamp ?? clientReceivedAt`

**Antes:**

```tsx
<TimeLabel ms={block.createdAt} />
```

**Depois:**

```tsx
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';
<TimeLabel text={formatBlockTimestamp(block, { locale })} />;
```

**Por que**: Vários clientes veem "X minutos atrás" consistente apenas quando todos
leem o relógio do daemon. O renderizador mais `formatBlockTimestamp` lida com fuso horário +
locale.

**Nota**: O daemon precisa carimbar `_meta.serverTimestamp` nos envelopes para
que isso tenha efeito. O SDK está pronto para compatibilidade futura; recai para
`clientReceivedAt` até lá.

### 3. Ouça novos tipos de evento — escolha um subconjunto para renderizar

Os 16 novos tipos de evento (session-meta, workspace, auth) não empurram blocos
de transcrição. São observações de canal lateral. Cada adaptador escolhe quais exibir:

```ts
// No seu consumidor SSE
const uiEvents = normalizeDaemonEvent(envelope, {
  clientId,
  suppressOwnUserEcho: true,
});
store.dispatch(uiEvents);

// Então no seu lado da UI
for (const event of uiEvents) {
  switch (event.type) {
    case 'session.approval_mode.changed':
      myApprovalModeBadge.update(event.next);
      break;
    case 'workspace.mcp.budget_warning':
      myToast.show(
        `MCP servers approaching budget: ${event.liveCount}/${event.budget}`,
      );
      break;
    case 'auth.device_flow.started':
      myAuthModal.show({
        deviceFlowId: event.deviceFlowId,
        providerId: event.providerId,
        expiresAt: event.expiresAt,
      });
      break;
    // ... etc, opt into what your UI needs
  }
}
```

Ou use seletores para canais laterais espelhados no estado:

```ts
import { selectApprovalMode, selectCurrentTool } from '@qwen-code/sdk/daemon';

const mode = selectApprovalMode(state); // espelhado de approval_mode.changed
const currentTool = selectCurrentTool(state); // ferramenta atual em andamento
```

### 4. Contrato de renderização: use `daemonBlockToMarkdown` (ou HTML / plainText)

**Antes** (cada adaptador faz sua própria projeção):

```ts
function blockToString(block: DaemonTranscriptBlock): string {
  switch (block.kind) {
    case 'user':
      return `You: ${block.text}`;
    case 'assistant':
      return block.text;
    case 'tool':
      return `[${block.title}]\n${block.status}`;
    // ... etc
  }
}
```

**Depois** (delegue ao SDK):

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

Adicione à suíte de testes do seu adaptador:

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('adapter projects daemon UI corpus correctly', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReduce(events),
    renderToText: (state) => myRender(state),
  });
  expect(result.failed).toEqual([]);
});
```

Isso executará seu adaptador contra 10 cenários de fixture e revelará qualquer
deriva de projeção antes que chegue aos usuários.

### 6. Dispacho de ícone de ferramenta via `provenance`

**Antes** (correspondência de string em toolName):

```tsx
const isMcp = toolName?.startsWith('mcp__');
const isBuiltin = ['Bash', 'Edit', 'Read'].includes(toolName);
```

**Depois** (provenance tipada do PR-A):

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
O SDK possui um fallback heurístico de nomenclatura `mcp__<server>__<tool>` — funciona hoje mesmo quando o daemon não marca explicitamente a proveniência.

### 7. Categorização de erros via `errorKind`

**Antes** (regex no texto):

```ts
if (error.text.includes('auth')) showAuthRetry();
else if (error.text.includes('file not found')) showFilePicker();
```

**Depois** (enum fechado do PR-A):

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

**Nota**: O daemon precisa marcar `data.errorKind` em session_died / stream_error para que isso seja populado. O SDK já o lê.

### 8. Tratamento de cancelamento — já automático

Na v1, prompts cancelados deixavam blocos de ferramenta em andamento girando para sempre. Na v2 (PR-E), `propagateCancellationToInFlightTools` é executado automaticamente em `assistant.done.reason === 'cancelled'`. Filhos de subagentes são cancelados junto com seu pai.

**Nenhuma mudança de adaptador necessária** — seus spinners resolverão corretamente.

### 8a. Aninhamento de subagente — opte pela renderização aninhada (PR-K)

Blocos de ferramenta invocados dentro de uma delegação de subagente agora carregam `parentToolCallId`, `subagentType`, e (quando o pai está em estado) `parentBlockId`. Adaptadores podem optar pela renderização aninhada:

**Antes** (lista plana, chamadas de subagente visualmente indistinguíveis das de nível superior):

```tsx
state.blocks.map((b) => <ToolBlock block={b} />);
```

**Depois** (renderização aninhada recursiva):

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

**Nenhuma mudança de adaptador necessária se você preferir a visualização plana** — os novos campos são aditivos e ignorados pelo código que não os lê.

### 9. Taxonomia de pré-visualização de ferramenta — escolha subconjunto para renderizar com componentes personalizados

PR-D + PR-F trazem 13 tipos de pré-visualização:

- 4 em forma de arquivo: `file_diff`, `file_read`, `web_fetch`, `mcp_invocation`
- 5 em forma de conteúdo: `code_block`, `search`, `tabular`, `image_generation`, `subagent_delegation`
- 2 de controle: `ask_user_question`, `command`
- 2 genéricos: `key_value`, `generic`

Cada adaptador despacha em `preview.kind`:

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
    // ... ou recorra a:
    default:
      return <Markdown text={daemonToolPreviewToMarkdown(preview)} />;
  }
}
```

Adaptadores sem componentes personalizados para todos os 13 tipos podem recorrer ao `daemonToolPreviewToMarkdown` do SDK para qualquer tipo não tratado.

## Checklist de compatibilidade reversa

| Preocupação                                                                    | Status                                        |
| ------------------------------------------------------------------------------ | --------------------------------------------- |
| Leituras existentes de `block.createdAt`                                       | ✅ ainda funciona (alias para `clientReceivedAt`) |
| Manipulação existente de eventos de reducer                                    | ✅ inalterada para tipos de evento v1         |
| Locais de chamada de `daemonTranscriptToUnifiedMessages(blocks)`               | ✅ novo parâmetro de opções é opcional        |
| Consumidores existentes de `selectTranscriptBlocks`                            | ✅ inalterado                                 |
| Novos tipos de evento no reducer v1                                            | ✅ no-op, `lastEventId` ainda avança          |

## Referências cruzadas

- [PR #4353 SUMMARY](https://github.com/QwenLM/qwen-code/pull/4353)
- [README da UI do Daemon](./README.md) — referência completa da API
- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — PR base com camada de transcrição de UI compartilhada
