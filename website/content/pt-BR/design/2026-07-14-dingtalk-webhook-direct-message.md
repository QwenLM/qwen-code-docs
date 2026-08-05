# Design de entrega de Webhook do DingTalk em conversa individual

## Status

Implementado e validado com o link real de conversa individual. Issue correspondente:
[QwenLM/qwen-code#6883](https://github.com/QwenLM/qwen-code/issues/6883).

## Contexto

Um canal hospedado pelo daemon pode receber eventos externos de Webhook autenticados, executar o agente como uma tarefa não supervisionada e entregar proativamente o resultado final a um destino de conversa pré-configurado. Atualmente o DingTalk suporta apenas entrega em conversa de grupo: o destino deve definir `isGroup: true`, e o adapter envia Markdown através da API de mensagens de grupo.

Isso faz com que fontes de Webhook como sistemas de CI e alertas de monitoramento não consigam notificar diretamente um usuário responsável do DingTalk, podendo apenas entregar em conversas de grupo.

## Objetivos

- Entregar resultados de tarefas Webhook do daemon a destinos de conversa individual do DingTalk.
- Manter inalterado o comportamento existente de entrega de Webhook em conversas de grupo do DingTalk.
- Manter a entrega proativa comum e o loop do canal aceitando apenas destinos de conversa de grupo do DingTalk, sem tratar o ID de conversa de conversa individual de entrada como ID de usuário.
- Reutilizar a estrutura existente de configuração de destinos, cache de token, formatação Markdown, fragmentação de mensagens, retry e tratamento de erros de entrega.
- Seguir o canal DingTalk existente, sem adicionar um novo canal ou campo de configuração.

## Não objetivos

- Cards nativos do DingTalk ou callbacks de Card.
- Atualizações de Card em streaming, botões, feedback ou cancelamento de tarefas a partir do DingTalk.
- Múltiplos destinatários em uma única configuração de destino.
- Entrega em tópicos do DingTalk.
- Novos tipos de canal ou modificação do protocolo de Webhook do daemon.

## Configuração de destino

Não são necessários novos campos de configuração. O significado dos campos existentes de destino de Webhook no canal DingTalk é o seguinte:

| `isGroup` | Significado de `chatId`                | API de entrega                  |
| --------- | -------------------------------------- | ------------------------------- |
| `true`    | `openConversationId` da conversa de grupo do DingTalk | `robot/groupMessages/send`    |
| `false`   | ID de usuário do DingTalk              | `robot/oToMessages/batchSend`   |

`senderId` continua sendo a identidade virtual usada para rotear a tarefa Webhook para a sessão do agente, não o ID de destinatário do DingTalk.

Exemplo de configuração:

```json
{
  "webhooks": {
    "sources": {
      "github-ci": {
        "secretEnv": "QWEN_CHANNEL_GITHUB_CI_SECRET",
        "targets": {
          "operator": {
            "chatId": "DINGTALK_USER_ID",
            "senderId": "webhook:github-ci",
            "isGroup": false
          },
          "team": {
            "chatId": "OPEN_CONVERSATION_ID",
            "senderId": "webhook:github-ci",
            "isGroup": true
          }
        }
      }
    }
  }
}
```

O destino deve definir explicitamente `isGroup`. Os seguintes destinos continuam sendo rejeitados pelo adapter: `chatId` vazio, `threadId` definido, `isGroup` ausente ou uso de URL de Webhook no lugar de um ID de destino estável.

## Cadeia de entrega

O roteamento do daemon e o IPC do worker permanecem inalterados; o runtime de canal compartilhado adiciona apenas a verificação de destinos específica de Webhook:

```text
POST /channels/:channelName/webhooks/:source
  -> o daemon autentica e valida o evento
  -> o channel worker executa a tarefa não supervisionada do agente
  -> ChannelBase chama DingtalkChannel.pushProactive()
  -> o adapter seleciona a API do DingTalk com base em target.isGroup
  -> o DingTalk recebe o Markdown
```

O runtime de canal compartilhado usa uma verificação de capacidade de destino de Webhook independente. A implementação padrão continua seguindo as regras de destino da entrega proativa comum; o DingTalk apenas aceita adicionalmente `isGroup: false` durante a resolução de tarefas Webhook. Portanto, o loop de canal comum continua rejeitando destinos de conversa individual, evitando tratar incorretamente o `conversationId` de entrada de conversa individual como o ID de usuário necessário para a API de mensagens um-para-um.

Destinos de conversa de grupo continuam usando o corpo de requisição existente:

```json
{
  "robotCode": "CLIENT_ID",
  "openConversationId": "OPEN_CONVERSATION_ID",
  "msgKey": "sampleMarkdown",
  "msgParam": "{...}"
}
```

Destinos de conversa individual enviam o mesmo modelo Markdown através da API de mensagens um-para-um:

```json
{
  "robotCode": "CLIENT_ID",
  "userIds": ["DINGTALK_USER_ID"],
  "msgKey": "sampleMarkdown",
  "msgParam": "{...}"
}
```

Os dois caminhos compartilham o cache existente de access token, atualizando um minuto antes da expiração do token; ao encontrar HTTP 401, fazem retry uma vez; ao mesmo tempo usam a mesma normalização Markdown e limites de fragmentação. A entrega em múltiplos fragmentos para após o primeiro fragmento falhar.

## Tratamento de erros

- Destinos inválidos não passam na validação da tarefa Webhook antes da execução do agente.
- Falha na obtenção do token continua sendo tratada como falha de entrega, com log registrado sem expor credenciais.
- HTTP 401 limpa o token em cache e faz retry uma vez para o fragmento atual.
- Outras respostas HTTP não bem-sucedidas interrompem a entrega e registram os detalhes da API com dados sensíveis removidos no log do channel worker.
- O daemon retornando `202 {"accepted": true}` continua significando apenas que o worker aceitou a tarefa, não que a entrega ao DingTalk foi bem-sucedida.

Apenas Markdown é suportado no escopo desta iteração, então não é necessário projetar uma estratégia de degradação de Markdown.

## Testes

### Testes unitários

- O Webhook aceita destinos de conversa de grupo e individual configurados explicitamente; a entrega proativa comum continua aceitando apenas destinos de conversa de grupo.
- Rejeita destinos sem `isGroup`, com ID vazio, usando URL de Webhook e com `threadId` definido.
- Mantém inalterados o endpoint de conversa de grupo existente e o corpo de requisição contendo `openConversationId`.
- A conversa individual usa o endpoint de mensagens um-para-um e o corpo de requisição contendo `userIds`.
- O envio de conversa de grupo e individual compartilha o token em cache.
- Após HTTP 401, atualiza o token e faz retry apenas uma vez.
- A entrega de conversa individual também segue as regras de fragmentação de mensagens e interrupção na primeira falha.

### Validação local ponta a ponta

Escrever o plano de testes em `.qwen/e2e-tests/` e, primeiro usando o CLI `qwen` instalado globalmente, registrar o comportamento baseline em que o destino de conversa individual do Webhook é rejeitado. Após a implementação estar concluída:

1. Configurar respectivamente um destino de conversa individual e um destino de conversa de grupo.
2. Habilitar o canal DingTalk e iniciar `qwen serve`.
3. Usar `curl` para submeter um evento para cada um dos dois `targetRef`.
4. Confirmar que ambas as requisições retornam `202`.
5. Confirmar que o channel worker conclui as duas tarefas.
6. Confirmar que tanto o usuário alvo do DingTalk quanto a conversa de grupo recebem a mensagem Markdown esperada.

Se não houver credenciais ou destino de recebimento do DingTalk disponível localmente, usar os testes unitários como validação automatizada de entrega e explicar explicitamente as etapas de validação online ausentes.

## Documentação

Atualizar a documentação de Webhook de canal para mostrar as duas configurações de destino do DingTalk, conversa individual e conversa de grupo, e explicar que o `chatId` do destino de conversa individual deve ser preenchido com o ID de usuário do DingTalk.

## Compatibilidade

Esta é uma mudança incremental. A configuração, validação, endpoint, corpo de requisição, formatação e comportamento de retry dos destinos de conversa de grupo existentes permanecem inalterados, sem necessidade de migração de configuração. A nova verificação de destinos de Webhook do runtime compartilhado delega por padrão para a verificação original de destinos de entrega proativa, então o comportamento de outros canais permanece inalterado.
