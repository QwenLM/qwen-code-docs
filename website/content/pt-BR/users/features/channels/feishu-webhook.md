# Envio via Feishu Webhook

Use um bot personalizado do Feishu para enviar notificações e resultados de tarefas ao seu grupo.
Este método precisa de uma URL de webhook e, quando habilitado no bot, um segredo de assinatura.
Não requer uma aplicação, uma conexão de longa duração ou um servidor de entrada.
Para conversas com um agente, use o [bot de aplicação do Feishu](./feishu).

## Criar o bot

1. Adicione um bot personalizado no grupo do Feishu de destino.
2. Copie sua URL de webhook, começando com
   `https://open.feishu.cn/open-apis/bot/v2/hook/`.
3. Configure as configurações de segurança do bot. Se a verificação de assinatura estiver habilitada,
   copie também seu segredo de assinatura. Restrições de palavra-chave e IP ainda se aplicam.

A URL contém uma credencial. Mantenha-a na configuração do Channel ou em uma variável
de ambiente, não em um prompt de tarefa ou destino de entrega. Esta integração suporta
`open.feishu.cn`; endpoints Lark não estão incluídos.

Use a URL exatamente como emitida pelo Feishu. A validação local requer um segmento
de token contendo letras, dígitos, `-`, `.`, `_` ou `~`, sem codificação
percent, parâmetros de query ou fragmento.

## Configurar um Channel

Configure esta integração no [Web Shell](#use-web-shell) ou `settings.json` conforme
mostrado abaixo.

Adicione uma instância nomeada às configurações de Channel do workspace:

```json
{
  "channels": {
    "team-notices": {
      "type": "feishu-webhook",
      "webhookUrl": "$FEISHU_WEBHOOK_URL",
      "signingSecret": "$FEISHU_WEBHOOK_SECRET"
    }
  }
}
```

Defina estas variáveis no ambiente usado para iniciar o Qwen Code. Omita
`signingSecret` se o bot não exigir assinatura. Use o segredo de assinatura do bot personalizado,
não o App Secret de uma aplicação.

Execute o daemon naquele workspace:

```bash
qwen serve --channel team-notices
```

Uma instância nomeada representa um grupo. Crie instâncias adicionais para outros
grupos. Alterar a URL de uma instância muda o destino para entregas futuras
que a referenciam.

Iniciar o Channel o deixa localmente pronto para enviar; não envia uma mensagem
de teste nem verifica credenciais remotas. Parar cancela envios em andamento. Reiniciar
ou recarregar aplica alterações de configuração salvas.

## Usar o Web Shell

Em Channels, escolha Feishu e depois Webhook (somente envio). Selecione o workspace,
salve a URL do webhook e o segredo de assinatura opcional, e inicie o Channel.
Configurações de recebimento, pareamento e sessão de agente não se aplicam a este método.
O método de bot de aplicação permanece disponível na mesma plataforma Feishu.

Em Scheduled Tasks, escolha uma sessão de tarefa persistente e selecione este Channel
como destino de entrega. O Web Shell preenche seu grupo configurado automaticamente;
nenhum contato observado ou ID de chat inserido manualmente é necessário. Restrições existentes
de entrega por execução e trigger manual permanecem em vigor.

Os mesmos controles estão disponíveis através de `WebShellWithProviders` quando o host
habilita Channels e Scheduled Tasks e fornece um workspace de daemon.

## Entrega explícita via API

Notify e entrega explícita de prompt/agendada usam o formato de destino
de Channel existente. Este adaptador possui um destino lógico, `chat/default`:

```json
{
  "text": "# Daily report\n\nThe checks passed.",
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

Este é um corpo de requisição Notify do workspace. `default` é um alias para o grupo
configurado, não um ID de chat do Feishu. Outros IDs e destinos de usuário são rejeitados. O endpoint
e o segredo de assinatura permanecem na configuração do Channel.

Tarefas agendadas persistentes usam a mesma tupla de destino. A entrega mantém o
comportamento existente de melhor esforço para resultado final bem-sucedido, incluindo restrições
atuais de entrega por execução e trigger manual.

## Formatação e limites de mensagens

- Envia texto plano e Markdown em um card de schema 2.0 estático. Cabeçalhos, listas,
  links, código em blocos, tabelas, chinês e emoji permanecem como entrada válida. O card não tem
  botões, atualizações de streaming ou resumo de pré-visualização duplicado.
- Usa o subconjunto Markdown do Feishu; compatibilidade completa com GitHub-flavored Markdown
  não é garantida. Tabelas usam elementos separados dentro do mesmo card. O Feishu
  documenta paginação após cinco linhas de dados por tabela.
- Escapa tags `<at ...>` e `</at>` completas com entidades HTML numéricas para
  que a marcação de menção fornecida pela tarefa seja enviada como texto literal. Isso também se aplica dentro
  de exemplos de código. Menções configuráveis e busca de destinatário não são suportadas.
  O comportamento de renderização e notificação do cliente deve ser verificado no seu grupo.
- Verifica a **requisição JSON UTF-8 serializada completa**, incluindo escape,
  estrutura do card e assinatura opcional, contra um **limite local de 20.000 bytes**.
  O guia de bot personalizado do Feishu indica 20 KB sem especificar a contagem exata de bytes;
  este limite local conservador não é um máximo medido da plataforma.
- Rejeita requisições muito grandes antes do envio, com uma falha de entrega explícita.
  O adaptador não trunca silenciosamente, divide em múltiplas requisições ou tenta novamente.
  A proteção de tamanho de entrega compartilhada ainda se aplica antes desta verificação de plataforma.
  Mantenha relatórios concisos o suficiente para que a requisição completa caiba.

## Falhas e transporte

Tanto o status HTTP quanto o `code` numérico do Feishu são verificados. Rejeições por palavra-chave, IP,
assinatura e limite de taxa são falhas observáveis. Erros omitem a URL do webhook,
segredos, conteúdo da mensagem e respostas brutas do provedor.

Cada tentativa envia no máximo uma requisição, com timeout de 15 segundos. Um timeout ou
cancelamento pode deixar o aceite remoto desconhecido. O Channel usa o proxy resolvido
do workspace e o comportamento de bypass `NO_PROXY` existente.

Este modo não recebe mensagens, executa tarefas de webhook de entrada ou inicia loops
de Channel. Não adiciona anexos, alertas de falha/cancelamento, fila de retry durável
ou protocolo de webhook genérico.

Consulte o [guia de bot personalizado](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot)
oficial e a [documentação do componente Markdown](https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/rich-text?lang=zh-CN)
para requisitos de configuração e renderização da plataforma.
