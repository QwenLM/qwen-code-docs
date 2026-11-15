# Envio via DingTalk Webhook

Use um robô personalizado do DingTalk para postar notificações e resultados de tarefas no grupo.
Este modo de envio não requer um bot de aplicativo, uma conexão de longa duração, um
servidor de callback público ou um ID de conversa. Para conversas com um agente,
use o [bot de aplicativo do DingTalk](./dingtalk) em vez disso.

## Criar o robô

1. Adicione um robô personalizado no grupo do DingTalk de destino.
2. Copie a URL do webhook, começando com
   `https://oapi.dingtalk.com/robot/send?access_token=...`.
3. Configure as definições de segurança do robô. Se a assinatura estiver habilitada, copie também o
   segredo de assinatura. Restrições de palavra-chave e IP ainda se aplicam a cada mensagem.

A URL do webhook contém uma credencial. Armazene-a como um segredo ou referência de
ambiente, não no prompt de uma tarefa agendada ou no destino de entrega.

## Configurar um Channel

Adicione uma instância nomeada nas configurações de Channel do workspace:

```json
{
  "channels": {
    "team-notices": {
      "type": "dingtalk-webhook",
      "webhookUrl": "$DINGTALK_WEBHOOK_URL",
      "signingSecret": "$DINGTALK_WEBHOOK_SECRET"
    }
  }
}
```

Defina as variáveis referenciadas no ambiente usado para iniciar o Qwen Code. Omita
`signingSecret` quando o robô não requer assinatura. Este segredo é o
segredo de assinatura do robô personalizado, não o Client Secret de um aplicativo.

Execute o daemon nesse workspace:

```bash
qwen serve --channel team-notices
```

Cada instância nomeada representa um grupo configurado. Crie instâncias adicionais
para outros grupos. Atualizar a URL de uma instância altera o destino para entregas
futuras que a referenciam.

## Usar o Web Shell

Em Channels, escolha DingTalk e seu método de envio via webhook. Salve a URL
do webhook e o segredo de assinatura opcional, depois inicie o Channel. Configurações
de recebimento, pareamento e sessão de agente não se aplicam a este método.

Um status ready/connected significa que os recursos locais de envio estão prontos;
não verifica credenciais remotas.

Em Scheduled Tasks, escolha uma tarefa persistente e selecione este Channel como
destino de entrega. O Web Shell preenche o destino configurado automaticamente;
nenhum contato observado ou ID de usuário/chat manual é necessário. As restrições
de entrega por execução existentes permanecem em vigor.

Os mesmos controles estão disponíveis no Web Shell compartilhado usado por
`WebShellWithProviders`, quando o host habilita Channels e Scheduled Tasks e
fornece um workspace daemon comum.

## Entrega explícita via API

Notificações e entrega explícita de prompt/agendada usam o formato de destino de Channel
existente. Este adaptador define `chat/default` como seu único destino lógico:

```json
{
  "text": "The daily report is ready.",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "team-notices",
      "type": "chat",
      "id": "default"
    }
  }
}
```

Este é o corpo de uma requisição Notify do workspace. `default` é um alias do adaptador,
não um ID de conversa do DingTalk. Outros IDs e alvos de usuário são rejeitados; o
adaptador nunca ignora um destino solicitado arbitrariamente. A URL do webhook e o
segredo de assinatura permanecem na configuração do Channel.

## Comportamento de entrega

- Envia mensagens como Markdown, com um título curto derivado da primeira linha.
  Texto simples também é aceito. O adaptador preserva o Markdown fornecido,
  incluindo sintaxe de tabela; a renderização é feita pelo cliente DingTalk.
- Não recebe mensagens, não executa tarefas de webhook de entrada nem habilita loops de Channel.
- Verifica tanto o status HTTP quanto a resposta de negócio do DingTalk. Assinaturas rejeitadas,
  credenciais, regras de segurança e limites de taxa são falhas com erros sanitizados.
- Não tenta automaticamente. Um timeout pode deixar a aceitação remota desconhecida.
- Usa a configuração de proxy do workspace, incluindo bypasses de `NO_PROXY`.
- Cancela envios em andamento quando o Channel para. O recarregamento usa a configuração
  salva atualizada.
- Mantém a proteção compartilhada de tamanho de entrega, que marca resultados truncados.
  A primeira versão envia esse resultado como uma mensagem e deixa o DingTalk rejeitar
  conteúdo excedente. A rejeição é reportada como falha de entrega; o adaptador
  não envia uma cópia reduzida, não divide mensagens nem tenta novamente. O limite exato
  de tamanho de Markdown do DingTalk e sua unidade não foram verificados, portanto, passar
  na verificação de tamanho compartilhada não garante a entrega. Mantenha relatórios agendados concisos.
- A entrega agendada mantém seu comportamento existente de melhor esforço para resultado final
  bem-sucedido. Isso não introduz alertas de falha/cancelamento, fila de retry durável,
  anexos ou um contrato genérico de payload de webhook.

Consulte a [API de envio](https://open.dingtalk.com/document/orgapp/custom-robots-send-group-messages),
[tipos de mensagem](https://open.dingtalk.com/document/orgapp/custom-bot-send-message-type)
e [configurações de segurança](https://open.dingtalk.com/document/orgapp/customize-robot-security-settings)
do DingTalk para os requisitos da plataforma.
