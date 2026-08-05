# Nomes de grupo de canais observados

## Problema

O grafo de contatos observados com escopo de workspace introduzido pelo #7109
preserva os IDs de grupo completos da plataforma, mas todo `groups[].label`
atualmente faz fallback para esse ID. Alguns callbacks de entrada de canal já
carregam um nome de grupo legível por humanos, e os adaptadores o descartam
antes do limite de observação compartilhado.

Usuários que selecionam um alvo de entrega proativa precisam do nome legível ao
lado do ID completo e estável da plataforma. O nome é um metadado observacional,
não uma chave de roteamento.

## Escopo

Adicionar um nome de grupo opcional ao envelope de entrada compartilhado e
preenchê-lo apenas a partir de metadados já presentes em uma mensagem de entrada
aceita.

- O DingTalk mapeia o `conversationTitle` do callback do Stream.
- O Telegram mapeia o `title` do chat de entrada para grupos e supergrupos.
- O Feishu mantém o fallback para o `chat_id` completo porque
  `im.message.receive_v1` não inclui um nome de exibição do chat.
- Outros adaptadores mantêm o fallback para o ID, a menos que seu payload de
  entrada existente tenha um campo de nome de grupo documentado.

Esta mudança não chama uma API de diretório de plataforma, detalhe de grupo ou
informação de chat; não adiciona permissões; não altera roteamento nem
identidade de sessão; não descobre composição autoritativa; não observa saída de
bot; e não adiciona nomes de tópico.

## Contrato

`Envelope` ganha um campo opcional:

```ts
chatName?: string;
```

O campo descreve o nome de exibição de `chatId` conforme observado naquela
mensagem. Ele é ignorado para mensagens diretas. `chatId` permanece como a chave
de entrega completa da plataforma e continua determinando sessões, deduplicação
e identidade do grafo.

O caminho de observação comum usa um `chatName` sanitizado e não vazio como o
rótulo do grupo. Valores ausentes ou inutilizáveis fazem fallback para o
`chatId` completo. O store existente do registry limita rótulos persistidos a
256 unidades de código UTF-16 sem dividir pares de surrogate.

## Semântica de renovação

Uma mensagem aceita posterior para o mesmo canal, usuário e grupo renova a
observação. Se ela carregar um `chatName` utilizável diferente, a semântica de
substituição do store existente atualiza o rótulo derivado do grupo sem criar
outro nó de grupo. A atualidade permanece `lastObservedAt`; nomes não são
tratados como permanentes ou autoritativos.

Uma plataforma que omite um nome de grupo em uma mensagem posterior contribui
com o fallback de ID para aquela observação. A derivação do grafo já seleciona a
observação mais recente, então o rótulo retornado representa a evidência aceita
mais nova, em vez de um cache de nomes oculto e duradouro.

## Evidência de plataforma

- O exemplo de mensagem de robô Stream do DingTalk inclui `conversationTitle` no
  callback de entrada: [DingTalk Stream protocol](https://opensource.dingtalk.com/developerpedia/docs/learn/stream/protocol/#%E5%9B%9E%E8%B0%83%E6%8E%A8%E9%80%81).
- O Telegram define `Message.chat` como um `Chat`, cujo `title` está disponível
  para chats de grupo e supergrupos: [Telegram Bot API — Chat](https://core.telegram.org/bots/api/#chat).
- O evento de recebimento de mensagem do Feishu enumera `chat_id`, `chat_type` e
  `thread_id`, mas nenhum nome de exibição do chat: [Feishu Open Platform — Receive message](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive).

## Estratégia de testes

- Testes de canal base provam que nomes de grupo utilizáveis se propagam, nomes
  inutilizáveis fazem fallback para IDs completos, mensagens diretas ignoram
  `chatName` e observações posteriores podem renovar rótulos.
- Testes do adaptador DingTalk provam que `conversationTitle` entra no envelope
  sem alterar o tratamento do callback.
- Testes do adaptador Telegram provam que títulos de grupo e supergrupo entram
  no envelope enquanto chats privados permanecem inalterados.
- Testes existentes do Feishu continuam provando o caminho de fallback de ID sem
  tráfego de API.
- Testes focados do store cobrem substituição por rótulos mais novos; nenhuma
  migração de schema é necessária porque observações persistidas já contêm
  `group.label`.
