# Umbrella de Status do Ciclo de Vida dos Canais

Data: 2026-07-01

## Objetivo

Fornecer uma superfície de revisão única que resume o comportamento do status do ciclo de vida nos adapters de canal suportados e destaca o que permanece intencionalmente fora do escopo.

## Escopo

- Telegram
- Weixin
- DingTalk
- Feishu

## Não Objetivos Explícitos

- O Slack permanece fora do escopo.
- O QQ Bot permanece fora do escopo para a UI de status do ciclo de vida.
- O exemplo de plugin permanece fora do escopo para a UI de status do ciclo de vida.
- O emoji de terminal do DingTalk permanece fora do escopo.

## Matriz de Revisão

| Canal          | Eventos de ciclo de vida suportados         | Superfície nativa                   | Comportamento de `started`                                                                                             | Comportamento de `text_chunk`                                                                                                    | Comportamento de terminal                                                                                                  | Motivo de não suportado / no-op                                                                                                                             | Arquivos de teste exatos                                                                          |
| -------------- | ------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Telegram       | `started`, `completed`, `cancelled`, `failed` | Indicador de digitação              | Inicia o loop de digitação existente por chat uma vez. Eventos `started` duplicados não adicionam outro loop.          | Ignorado pelo hook do ciclo de vida. O conteúdo da resposta continua pelo caminho normal de resposta.                      | Para o loop de digitação em qualquer evento de terminal e não deixa nenhum intervalo obsoleto para trás.                 | `tool_call` não possui uma superfície de status nativa e não precisa de UI do adapter.                                                                    | `packages/channels/telegram/src/TelegramAdapter.test.ts`                                        |
| Weixin         | `started`, `completed`, `cancelled`, `failed` | Indicador de digitação              | Chama `setTyping(chatId, true)` uma vez para o chat ativo. Eventos `started` duplicados não reempilham o estado de digitação. | Ignorado pelo hook do ciclo de vida. O conteúdo da resposta continua pelo caminho normal de envio.                         | Chama `setTyping(chatId, false)` em eventos de terminal. Tentativas de início com falha limpam o estado local para que um `started` posterior possa tentar novamente. | `tool_call` não possui uma superfície de status separada e nenhuma mensagem extra deve ser enviada.                                                       | `packages/channels/weixin/src/WeixinAdapter.test.ts`                                            |
| DingTalk       | `started`, `completed`, `cancelled`, `failed` | Reação de olho na mensagem recebida | Anexa a reação de olho existente uma vez quando um id de conversa está disponível.                                     | Ignorado pelo hook do ciclo de vida. O conteúdo da resposta continua pelo caminho normal de envio.                         | Retira a reação de olho em eventos de terminal, incluindo condições de corrida de anexação de resolução tardia após o cancelamento.                            | Chats diretos de webhook de robô não expõem o id de conversa necessário para reações, portanto, o status do ciclo de vida é um no-op nesses casos. `tool_call` também não possui UI no escopo. | `packages/channels/dingtalk/src/DingtalkAdapter.test.ts`                                        |
| Feishu         | `started`, `completed`, `cancelled`, `failed` | Rótulo de status do card de streaming | Mantém o card em seu estado de execução e reserva espaço para o rótulo de execução enquanto o stream do card existente está ativo. | Não é consumido diretamente pelo hook do ciclo de vida. O streaming de conteúdo continua sendo de responsabilidade do hook de stream de resposta/card existente. | Finaliza o rótulo de status do card como concluído, cancelado ou falhou sem sobrescrever o corpo da resposta em streaming.                                   | `tool_call` permanece oculto porque o card já usa apenas o stream de resposta mais os rótulos de status de terminal.                                        | `packages/channels/feishu/src/adapter.test.ts`, `packages/channels/feishu/src/markdown.test.ts` |
| QQ Bot         | Nenhum                                      | Nenhum                              | No-op.                                                                                                                 | No-op. O QQ Bot ainda faz streaming de chunks de resposta por meio de envios de mensagens de saída, mas não por meio de atualizações de status do ciclo de vida. | No-op.                                                                                                                   | O canal não possui endpoint de digitação ou status de tarefa, e `QQChannel` deixa `onPromptStart`, `onPromptEnd` e `onTaskLifecycle` vazios por design.       | `packages/channels/qqbot/src/send.test.ts`, `packages/channels/qqbot/src/api.test.ts`           |
| Plugin example | Nenhum                                      | Apenas mensagens do protocolo WebSocket | No-op para status do ciclo de vida.                                                                                    | Faz streaming de chunks de resposta pelo tipo de mensagem `chunk` do protocolo mock a partir de `onResponseChunk`, fora do tratamento de status do ciclo de vida. | Envia a mensagem final de saída na conclusão da resposta, fora do tratamento de status do ciclo de vida.                                                   | O canal mock demonstra apenas a conexão de transporte; não possui superfície nativa de digitação, reação ou status.                                           | `integration-tests/channel-plugin.test.ts`                                                      |

## Notas de Revisão

- O `text_chunk` do ciclo de vida do Feishu permanece como no-op no hook do ciclo de vida. Ele não anexa ou atualiza o conteúdo da resposta ali.
- O Slack é intencionalmente excluído desta matriz porque está fora do escopo.
- Os eventos de terminal do DingTalk apenas retiram a reação de olho existente neste escopo. Nenhum emoji de terminal é adicionado.