# Envio via Webhook do WeCom

Use o webhook de Envio de Mensagens (anteriormente chamado de robô de grupo) de um grupo interno do WeCom para enviar notificações e resultados de tarefas. Isso requer apenas a URL do webhook do grupo, sem Bot ID/Secret, credenciais de aplicativo, uma conexão de longa duração ou um servidor público de entrada. Para conversas com um agente, use o [robô inteligente do WeCom](./wecom); para um aplicativo personalizado, consulte [WeCom Callback](./wecom-callback).

## Criar um destino de grupo

1. Abra as configurações de um grupo interno do WeCom e localize Envio de Mensagens.
2. Crie um Envio de Mensagens personalizado e copie sua URL de webhook, começando com
   `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=`.
3. Verifique as permissões de criação da sua organização se a opção não estiver disponível.
   Administradores podem restringir quais membros podem criar Envios de Mensagens, e
   grupos gerenciados pelo proprietário podem restringir a opção apenas ao proprietário do grupo.

Grupos externos não são suportados por esta configuração. As condições oficiais de criação
descrevem permissões de grupo interno e administrador; elas não estabelecem um requisito
ou isenção universal de certificação empresarial.

A URL contém a credencial de envio. Mantenha-a na configuração do Channel ou em uma
variável de ambiente, nunca em um prompt de tarefa ou destino de entrega. Use a URL
conforme emitida pelo WeCom. A validação local permite exatamente um parâmetro `key`
contendo letras, dígitos, `-`, `.`, `_` ou `~`; codificação percentual, fragmentos e
parâmetros adicionais não são aceitos. Não há segredo de assinatura separado.

## Configurar um Channel

Configure esta integração no [Web Shell](#use-web-shell) ou no `settings.json` conforme
mostrado abaixo.

Adicione uma instância nomeada às configurações de Channel do workspace:

```json
{
  "channels": {
    "team-notices": {
      "type": "wecom-webhook",
      "webhookUrl": "$WECOM_WEBHOOK_URL"
    }
  }
}
```

Defina `WECOM_WEBHOOK_URL` no ambiente usado para iniciar o Qwen Code e em seguida
execute o daemon nesse workspace:

```bash
qwen serve --channel team-notices
```

Uma instância nomeada representa um grupo. Crie instâncias adicionais para outros
grupos. Alterar a URL de uma instância altera as entregas futuras através dela.

Iniciar torna o Channel localmente pronto para enviar. Isso não envia uma mensagem
de teste nem verifica a credencial remota. Parar cancela envios em andamento;
reiniciar ou recarregar aplica alterações de configuração salvas.

## Usar o Web Shell

Se o seu build contém o suporte de backend mas é anterior à integração Web,
Channels não lista este método ou instâncias `wecom-webhook` existentes. Use
as etapas `settings.json` e `qwen serve --channel` acima até atualizar para
um build que contenha a integração Web.

Em Channels, escolha WeCom e depois Webhook (somente envio). Selecione o workspace,
salve a URL do webhook e inicie o Channel. Nenhum segredo de assinatura é necessário.
As configurações de recebimento, pareamento e sessão de agente não se aplicam a este método.
O método de robô inteligente permanece em WeCom; WeCom Callback mantém sua
entrada separada.

Em Scheduled Tasks, escolha uma sessão de tarefa persistente e selecione este Channel
como destino de entrega. O Web Shell preenche o grupo configurado automaticamente;
nenhum contato observado ou ID de chat inserido manualmente é necessário. As restrições
de entrega por execução e por acionamento manual existentes permanecem em vigor.

Os mesmos controles estão disponíveis através do `WebShellWithProviders` quando o host
habilita Channels e Scheduled Tasks e fornece um workspace de daemon.

## Entrega explícita via API

Notify e entrega explícita de prompt/agendada usam o destino de Channel existente.
Este adaptador possui um destino lógico, `chat/default`:

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

Este é um corpo de requisição Notify de workspace. `default` nomeia o grupo configurado;
não é um chat ID do WeCom. Outros IDs, destinos de usuário e threads são rejeitados.
Tarefas armazenam o destino lógico; a credencial permanece nas configurações do Channel.

Tarefas agendadas persistentes usam o mesmo destino. A entrega mantém o comportamento
existente de melhor esforço para resultado final bem-sucedido, incluindo as restrições
atuais por execução e por acionamento manual.

## Formatação e limites de mensagens

- Envia `markdown_v2` com o texto original. Seu subconjunto suportado inclui
  cabeçalhos, listas, links, blocos de código com delimitadores e tabelas; texto comum,
  chinês e emoji são entradas válidas. Compatibilidade completa com GitHub-flavored Markdown
  não é garantida.
- Este formato não suporta menções nem marcação de cor de fonte. O adaptador
  não envia arrays de menção e não transforma texto de tarefa em menções.
  Strings com aparência de menção como `< @all>` permanecem no corpo.
- Clientes anteriores à versão 4.1.36 (Android anterior à 4.1.38) exibem a mensagem como texto simples.
  Use um cliente atual para renderização Markdown.
- O **conteúdo** final é limitado a **4096 bytes UTF-8**, antes do escape JSON.
  Chinês e emoji ocupam mais bytes que ASCII. Este não é um limite de 4096 caracteres
  nem um limite na requisição JSON completa.
- Conteúdo excedente falha explicitamente antes do envio. Não há truncamento silencioso
  pelo adaptador, divisão automática ou nova tentativa. O limite de entrega compartilhado ainda
  se aplica antes da verificação específica da plataforma.
- O WeCom permite **20 mensagens por minuto por webhook**. Mantenha relatórios agendados
  concisos e evite rajadas; entregas com limitação de taxa reportam falha sem enfileiramento.

## Falhas e transporte

Tanto o status HTTP quanto o `errcode` numérico do WeCom são verificados. Credenciais inválidas ou
desabilitadas, destinos de grupo rejeitados e limites de taxa produzem falhas observáveis.
Diagnósticos omitem a URL, chave, conteúdo da mensagem e texto de erro bruto do provedor.

Cada tentativa faz no máximo uma requisição com timeout de 15 segundos. A aceitação pela API
não é uma confirmação de leitura; um timeout ou cancelamento pode deixar a aceitação remota
desconhecida. O transporte honra o proxy resolvido do workspace e o comportamento existente
de `NO_PROXY`.

Este modo não recebe mensagens, não executa tarefas de webhook de entrada nem inicia loops
de Channel. Não adiciona anexos, cards interativos, alertas automáticos de falha/cancelamento,
nova tentativa durável ou protocolo de webhook genérico.

Consulte o [protocolo de Envio de Mensagens](https://developer.work.weixin.qq.com/document/path/91770) oficial
e o [guia de configuração](https://open.work.weixin.qq.com/help2/pc/14931) para os requisitos
atuais da plataforma.
