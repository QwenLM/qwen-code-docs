# Adaptadores de Status do Ciclo de Vida do Canal

Data: 2026-07-01

## Objetivo

Expor o estado do ciclo de vida da tarefa através dos quatro primeiros adaptadores de canal:

- Telegram
- Weixin
- DingTalk
- Feishu

Esta é uma continuação P1.1 do trabalho de identidade do canal e metadados do ciclo de vida.
O objetivo é fazer com que cada canal suportado exiba o melhor sinal de progresso nativo disponível, sem alterar novamente o contrato compartilhado do canal.

## Não Objetivos

- Não implementar o comportamento do Slack.
- Não implementar o comportamento do QQ Bot.
- Não atualizar exemplos de mock/plugin.
- Não adicionar emoji de status terminal para o DingTalk.
- Não introduzir uma abstração compartilhada de renderização de status para uma rodada de mapeamentos específicos do adaptador.

## Referências e Alinhamento

O design segue primeiro as capacidades atuais do adaptador de canal do Qwen.
A semântica do ciclo de vida permanece alinhada com o modelo de status de tarefa/sessão já existente usado neste repositório: uma tarefa pode iniciar, executar, concluir, ser cancelada ou falhar. Nenhum modelo de status externo adicional é introduzido neste escopo, pois cada canal já possui uma superfície nativa clara para esses estados.

## Estado Atual

| Canal  | Superfície de status existente | Comportamento atual                                                     |
| -------- | ----------------------- | -------------------------------------------------------------------- |
| Telegram | Indicador de digitação        | Inicia a digitação no início do prompt e para no fim do prompt.               |
| Weixin   | Indicador de digitação        | Inicia a digitação no início do prompt e para no fim do prompt.               |
| DingTalk | Reação à mensagem        | Adiciona a reação de olho no início do prompt e a remove no fim do prompt.  |
| Feishu   | Card de streaming          | Exibe e atualiza um card de streaming, com fluxos de conclusão e erro. |

## Design Proposto

Mantenha a implementação local ao adaptador. Cada adaptador consome o hook de evento do ciclo de vida e mapeia o evento para a superfície de status nativa existente da plataforma.

| Evento do ciclo de vida | Telegram      | Weixin        | DingTalk             | Feishu                                                                                           |
| --------------- | ------------- | ------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| `started`       | Iniciar digitação. | Iniciar digitação. | Adicionar reação de olho.    | Exibir/atualizar card como em execução.                                                                     |
| `text_chunk`    | Ignorar.       | Ignorar.       | Ignorar.              | Ignorar no hook do ciclo de vida. O streaming de conteúdo permanece no caminho de stream de resposta/card existente. |
| `tool_call`     | Ignorar.       | Ignorar.       | Ignorar.              | Ignorar para a UI.                                                                                   |
| `completed`     | Parar digitação.  | Parar digitação.  | Remover reação de olho. | Marcar card como concluído.                                                                             |
| `cancelled`     | Parar digitação.  | Parar digitação.  | Remover reação de olho. | Marcar card como cancelado.                                                                             |
| `failed`        | Parar digitação.  | Parar digitação.  | Remover reação de olho. | Marcar card como falhou.                                                                                |

### Telegram

O Telegram mantém a implementação de digitação existente. O hook do ciclo de vida deve mapear `started` para o caminho de início de digitação existente e todos os eventos terminais para o caminho de parada de digitação existente.

`text_chunk` e `tool_call` não precisam de alterações na UI do Telegram.

### Weixin

O Weixin segue o mesmo formato do Telegram. O hook do ciclo de vida deve mapear `started` para `setTyping(true)` e os eventos terminais para `setTyping(false)`.

Nenhuma mensagem adicional é enviada.

### DingTalk

O DingTalk mantém o comportamento existente de reação de olho:

- `started`: anexar a reação de olho existente.
- `completed`, `cancelled`, `failed`: remover a reação de olho existente.

Não há emoji terminal neste escopo. Tarefas falhas e canceladas não devem enviar mensagens de status extras, a menos que um caminho de erro existente já o faça.

### Feishu

O Feishu mantém o card de streaming como superfície de status e torna o estado terminal explícito no conteúdo do card:

| Estado     | Rótulo do card       |
| --------- | ---------------- |
| Em execução   | `Executando...`      |
| Concluído | `Concluído`         |
| Cancelado | `Cancelado`         |
| Com falha    | `Falhou, tente novamente` |

O card ainda faz o streaming do conteúdo da resposta como faz hoje através do hook de stream de resposta/card existente. O `text_chunk` do ciclo de vida não é consumido diretamente pelo adaptador neste escopo, o que substitui a ideia anterior local do adaptador de usar chunks do ciclo de vida para anexar conteúdo ao card. O `tool_call` permanece oculto da UI do card neste escopo.

O helper de markdown/card pode aceitar uma opção mínima de rótulo de status se necessário, mas não deve se transformar em um framework de renderização genérico.

## Fluxo de Dados

1. A execução do canal emite eventos do ciclo de vida a partir da camada base do canal.
2. O adaptador selecionado recebe o evento através do seu hook do ciclo de vida.
3. O adaptador mapeia o evento para a superfície de status da plataforma.
4. As atualizações de status da plataforma são executadas no modo best-effort e não afetam a execução da tarefa.

O payload do evento do ciclo de vida deve fornecer contexto existente suficiente para identificar a mensagem/sessão do canal. Se um identificador específico da plataforma estiver faltando, o adaptador ignora a atualização de status.

## Tratamento de Erros

As atualizações de status da plataforma não são críticas. Uma atualização de status de digitação, reação ou card com falha deve ser registrada ou ignorada de acordo com o estilo existente do adaptador e não deve falhar a tarefa.

Os eventos terminais devem ser idempotentes para uma mensagem/sessão. Eventos terminais repetidos não devem criar atualizações de status duplicadas ou deixar um indicador de execução obsoleto.

O Feishu precisa de cuidado especial porque já possui fluxos de conclusão de card, erro e botão de parada. O mapeamento do ciclo de vida deve reutilizar o estado existente da sessão do card e evitar atualizações concorrentes que sobrescrevam um estado terminal mais específico.

## Plano de Testes

Adicione cobertura unitária focada nos pacotes de canal afetados:

- Telegram: o `started` do ciclo de vida inicia a digitação; eventos terminais param a digitação; nenhum intervalo de digitação duplicado é introduzido.
- Weixin: o `started` do ciclo de vida chama `setTyping(true)`; eventos terminais chamam `setTyping(false)`.
- DingTalk: o `started` do ciclo de vida anexa a reação de olho; eventos terminais a removem; nenhum emoji terminal é enviado.
- Feishu: os estados de card em execução, concluído, cancelado e com falha renderizam os rótulos esperados; o `text_chunk` do ciclo de vida permanece pertencente ao caminho de stream existente, em vez do hook do ciclo de vida; o `tool_call` não adiciona saída na UI.

A verificação deve executar comandos locais do Vitest do pacote para os adaptadores alterados, seguido pelo build do projeto e typecheck antes que o PR seja enviado.

## Decisões em Aberto

Nenhuma. O escopo atual é intencionalmente restrito e segue as capacidades existentes dos adaptadores.