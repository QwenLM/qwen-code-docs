# Design de Identidade de Canal P0 e Ciclo de Vida de Tarefas

## Goal

Implementar a primeira base P0 para agentes multiplayer residentes em canais:
identidade com escopo de canal e metadados de limite de memória, além de um hook
de ciclo de vida de tarefa compartilhado em `@qwen-code/channel-base`.

Intencionalmente, isso não adiciona um adaptador do Slack, stream de eventos do
daemon, alterações na UI do adaptador, agendamento proativo, contexto entre
canais ou isolamento real de caminho de core memory.

## Background

O `qwen channel` já suporta adaptadores de mensagens, sessões compartilhadas,
atribuição de remetente, modos de despacho, chunks de streaming, callbacks de
chamadas de ferramentas, cancelamento e superfícies de progresso específicas da
plataforma, como cartões do Feishu. A camada de produto P0 ausente é uma maneira
estável de dizer "este canal tem sua própria identidade de agente residente" e
"este turno de prompt tem um ciclo de vida que os adaptadores podem observar".

A issue #6103 rastreia este escopo focado. Ela se baseia no roadmap mais amplo
da tag qwen em #5887, mas mantém este PR pequeno o suficiente para ser revisado
e lançado independentemente.

## Scope

No escopo:

- Adicionar metadados opcionais de identidade de canal ao `ChannelConfig`.
- Adicionar metadados opcionais de escopo de memória ao `ChannelConfig`.
- Derivar padrões seguros quando a nova configuração for omitida.
- Injetar uma nota concisa de limite de canal no primeiro prompt de cada sessão
  do agente, junto com as instruções de canal existentes.
- Adicionar um hook protegido `onTaskLifecycle(event)` no `ChannelBase`.
- Emitir eventos de ciclo de vida do fluxo de canal compartilhado para início de
  prompt, chunks de texto, chamadas de ferramentas, cancelamento, conclusão e
  erros.
- Adicionar testes focados e locais ao pacote em `packages/channels/base`.

Fora do escopo:

- Alterações no armazenamento de core memory ou isolamento de namespace de
  caminho de arquivo.
- Publicação de eventos de daemon/SSE.
- Alterações na UI do Feishu, DingTalk, Telegram, WeChat ou QQ.
- Novos adaptadores de plataforma.
- Orçamentos de tokens, ACLs de ferramentas ou compartilhamento de contexto
  entre canais.

## Design

### Identidade do Canal

Adicione um pequeno objeto de configuração opcional:

```ts
export interface ChannelIdentityConfig {
  id?: string;
  displayName?: string;
  description?: string;
}
```

`ChannelConfig` ganha `identity?: ChannelIdentityConfig`.

Em tempo de execução, o `ChannelBase` deriva:

- `id`: `config.identity.id` ou `channel:<name>`
- `displayName`: `config.identity.displayName` ou `<name>`
- `description`: `config.identity.description`, se presente

A identidade em tempo de execução é apenas metadados. Ela não altera o
roteamento de sessões, controle de acesso ou comportamento do adaptador de
plataforma.

### Metadados de Escopo de Memória

Adicione:

```ts
export type ChannelMemoryScopeMode = 'metadata-only';

export interface ChannelMemoryScopeConfig {
  namespace?: string;
  mode?: ChannelMemoryScopeMode;
}
```

`ChannelConfig` ganha `memoryScope?: ChannelMemoryScopeConfig`.

Em tempo de execução, o `ChannelBase` deriva:

- `namespace`: `config.memoryScope.namespace` ou `channel:<name>`
- `mode`: sempre `'metadata-only'` para este PR

Deliberadamente, este não é um namespace de core memory real. É um marcador de
limite explícito e inspecionável e uma instrução de prompt para que trabalhos
futuros possam conectar o mesmo namespace aos caminhos de core memory sem
alterar a forma da configuração do canal.

### Injeção de Limite de Prompt

O `ChannelBase` já prefixa `config.instructions` uma vez por sessão; esse
comportamento não foi alterado. A nota de limite gerada abaixo é adicionada à
mesma injeção de primeira mensagem apenas quando um canal configura `identity`
ou `memoryScope` (canais com apenas instruções mantêm a forma de prompt
existente). Ela é anexada após as instruções personalizadas para que o limite
tenha precedência de recenticidade:

```text
Identidade do canal:
- id: channel:ops
- nome de exibição: Ops Bot
- descrição: Ajuda o grupo de ops a coordenar a manutenção do repositório.

Escopo de memória:
- namespace: qwen-tag:ops
- modo: metadata-only
- dados de outros canais não devem ser compartilhados.
```

A redação exata deve ser concisa e estável o suficiente para os testes, mas
evite prometer isolamento demais. Se não houver descrição, omita essa linha.

Esta nota é injetada uma vez por sessão do agente, assim como as instruções
existentes (uma falha transitória de leitura da memória do canal tenta ler todo
o bloco de contexto novamente no próximo turno, então turnos consecutivos podem
repeti-la). Quando a bridge reporta a morte de uma sessão, a limpeza existente
de `instructedSessions` continua a permitir a reinjeção para a próxima sessão.

Para compatibilidade, canais sem configuração de `instructions`, `identity` ou
`memoryScope` mantêm a forma de prompt bruto existente. A identidade em tempo de
execução e os metadados de memória ainda são derivados para eventos de ciclo de
vida e comandos de status.

### Visibilidade de Status

Estenda `/who` e `/status` com metadados de identidade e memória:

- `/who` deve incluir o nome de exibição da identidade e o namespace de memória.
- `/status` deve incluir o id da identidade e o modo de memória.

Mantenha a saída curta. Não exponha caminhos absolutos ou configurações ocultas.

### Hook de Ciclo de Vida de Tarefas

Adicione uma união discriminada:

```ts
export type ChannelTaskLifecycleEvent =
  | {
      type: 'started';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'text_chunk';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      chunk: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'tool_call';
      channelName: string;
      chatId: string;
      sessionId: string;
      toolCall: ToolCallEvent;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'cancelled';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      reason: 'cancel_command' | 'clear' | 'steer' | 'timeout';
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'completed';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'failed';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      error: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    };
```

`ChannelBase` adiciona:

```ts
protected onTaskLifecycle(_event: ChannelTaskLifecycleEvent): void {}
```

O comportamento padrão é no-op. Os adaptadores podem optar por usar depois sem
alterar o caminho de execução do prompt.

### Pontos de Emissão do Ciclo de Vida

Emita do fluxo compartilhado do `ChannelBase`:

- `started`: imediatamente após `activePrompts.set()` e antes de
  `onPromptStart()`.
- `text_chunk`: quando o listener `textChunk` do prompt aceita um chunk não
  cancelado.
- `tool_call`: no listener de chamada de ferramenta da bridge existente após
  resolver o alvo da sessão.
- `cancelled`: quando `/cancel` é bem-sucedido, quando `/clear` cancela ou
  remove um prompt ativo, e quando `steer` marca o turno ativo como cancelado.
- `completed`: após `bridge.prompt()` ser resolvido e antes ou depois de
  `onResponseComplete()`, desde que o turno não tenha sido cancelado.
- `failed`: quando `bridge.prompt()` ou a entrega da resposta lança uma exceção.

Falhas no hook de ciclo de vida devem ser capturadas e registradas no stderr. A
UI de ciclo de vida de um adaptador de plataforma não deve interromper a
execução ou a limpeza do prompt.

## Error Handling

- Campos de identidade ou memória inválidos não são fatais neste PR; o parsing
  da configuração deve preservar a forma permissiva existente e aceitar apenas
  campos de string onde o parsing explícito já existe.
- Exceções do hook de ciclo de vida são engolidas após um diagnóstico no stderr.
- O modo de escopo de memória é restrito a `'metadata-only'`; configurações
  omitidas ou desconhecidas devem resolver para `'metadata-only'` em vez de
  habilitar um comportamento que não existe.

## Tests

Testes focados em `packages/channels/base/src/ChannelBase.test.ts` devem cobrir:

- Metadados padrão de identidade e memória são derivados do nome do canal.
- Identidade personalizada e namespace de memória são incluídos no primeiro
  prompt.
- Metadados de limite são injetados uma vez por sessão e reinjetados após
  `sessionDied`.
- `/who` e `/status` incluem os novos metadados sem vazar o cwd.
- `onTaskLifecycle` vê `started`, `text_chunk`, `tool_call`, `completed`.
- `onTaskLifecycle` vê `cancelled` para `/cancel`, `/clear` e `steer`.
- `onTaskLifecycle` vê `failed` quando `bridge.prompt()` rejeita.
- Um hook de ciclo de vida que lança exceção não rejeita `handleInbound()`.

Use comandos locais do pacote:

```bash
cd packages/channels/base
npx vitest run src/ChannelBase.test.ts
```

Verificação final antes do PR:

```bash
npm run build
npm run typecheck
```

## Open Decisions

Nenhuma para este PR. A aplicação real de namespace de core memory, publicação
de daemon, UI do adaptador, ACLs de ferramentas/dados, orçamentos e
acompanhamento proativo são explicitamente trabalhos futuros.