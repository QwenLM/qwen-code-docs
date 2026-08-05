# Proveniência de contexto do hook UserPromptSubmit

Issue: https://github.com/QwenLM/qwen-code/issues/7940

## Problema

Hooks `UserPromptSubmit` podem retornar `additionalContext`, que o cliente
anexa à requisição de saída como uma parte de texto nua. Como
`recordUserMessage` persiste a requisição aumentada, o texto injetado cai em
`message.parts` do registro do usuário indistinguível de texto escrito pelo
usuário.

Consequências:

- **Resume**: a projeção da UI concatena todas as partes de texto, então
  sessões retomadas exibem contexto injetado por hook como se o usuário o
  tivesse digitado.
- **Análise offline / consumidores downstream**: a transcrição JSONL não
  consegue separar texto do usuário de injeção; consumidores recorrem a
  heurísticas frágeis e customizadas de remoção de marcadores.
- **Telemetria e recall de memória automática**: ambos consumiam
  `partToString(request)` após a injeção, poluindo o atributo de prompt e a
  consulta de recall.

A TUI ao vivo não é afetada (ela constrói seu item de histórico a partir da
entrada pré-hook), que é exatamente a assimetria que tornou a transcrição
poluída fácil de passar despercebida.

## Design

Isomórfico a dois padrões existentes: o contexto de `SessionStart` é injetado
como um bloco marcado na instrução de sistema, e registros de meio de
turno/notificação separam o `message` destinado ao modelo de uma projeção
`systemPayload.displayText`.

### Caminho de escrita

1. **Injeção marcada** (`client.ts`): o `additionalContext` saneado é anexado
   como sua própria parte envolvida em
   `<qwen:user-prompt-submit-context>...</qwen:user-prompt-submit-context>`.
   `getAdditionalContext()` escapa `<`/`>` na saída do hook, então o wrapper
   não pode ser fechado ou forjado por dentro. Texto escrito pelo usuário
   nunca é reescrito ou escapado. `promptText` deve ser declarado antes da
   atribuição de injeção que o captura em `preInjectionPromptText` (evita uma
   TDZ se o try/catch do Goal ao redor for reorganizado depois).
2. **Proveniência de exibição** (`chatRecordingService.ts`):
   `recordUserMessage` aceita um `UserPromptRecordPayload { displayText? }`
   opcional armazenado como `systemPayload`. `message` mantém exatamente o
   Content destinado ao modelo — o resume deve reproduzir o que o modelo
   realmente viu — enquanto `displayText` preserva a projeção do usuário
   pré-injeção. Texto injetado por hook permanece na entrada marcada de
   `message.parts` (parseável por máquina). O payload só é escrito quando um
   hook realmente injetou contexto.
3. **Telemetria e recall** (`client.ts`): `addUserPromptAttributes` e
   `MemoryManager.recall` usam o texto do prompt pré-injeção quando a injeção
   ocorreu.

### Caminho de leitura (projeção de resume)

`resumeHistoryUtils` projeta registros de usuário simples através de um
fallback de três formatos:

- (a) registros novos: preferir `systemPayload.displayText`;
- (b) registros apenas com tag (sem payload): descartar uma parte final que
  é, em sua totalidade, um bloco marcado — apenas correspondência estrita de
  parte inteira, então prosa do usuário que meramente contém a tag nunca é
  removida. Uma única parte correspondendo ao formato da tag também é mantida
  (a injeção sempre anexa após a(s) parte(s) do próprio usuário, então um
  registro de parte única só pode ter sido escrito pelo usuário);
- (c) registros legados com injeção nua: concatenação inalterada.

O ramo de resume do comando `@` ainda prefere `AtCommandRecordPayload.userText`
quando presente; apenas o fallback com `userText` ausente passa por
`extractUserRecordDisplayText`, então uma parte marcada final não sobrescreve
o texto de exibição do comando `@`.

## Notas de escopo

- Focado no caminho interativo de `UserPromptSubmit`. O caminho de sessão ACP
  já registra o texto do prompt pré-injeção, então só precisava do mesmo
  envolvimento de tag na sua injeção destinada ao modelo (incluído aqui).
  Injeção de contexto de subagente (`SubagentStart` via `contextState`)
  precisa de sua própria investigação e é um acompanhamento.
- Outros consumidores de transcrição (desktop, web UI) podem adotar
  `displayText` em acompanhamentos; até lá eles veem o formato marcado, que é
  ao menos mecanicamente identificável.

Consumidores ACP/export/daemon que passam pelo `projectUserRecord` do
`transcript-replay` também preferem `displayText` e removem uma parte marcada
final para registros de usuário sem subtype (mesmo fallback de três formatos
que o caminho de resume da TUI).
