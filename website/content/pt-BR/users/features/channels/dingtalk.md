# DingTalk (Dingtalk)

Este guia cobre a configuração de um canal do Qwen Code no DingTalk (钉钉).

## Pré-requisitos

- Uma conta organizacional no DingTalk
- Um aplicativo bot do DingTalk com AppKey e AppSecret (veja abaixo)

## Criando um Bot

1. Acesse o [Portal do Desenvolvedor DingTalk](https://open-dev.dingtalk.com)
2. Crie um novo aplicativo (ou use um existente)
3. No aplicativo, habilite a capacidade **Robot**
4. Nas configurações do Robot, habilite **Stream Mode** (机器人协议 → Stream 模式)
5. Anote o **AppKey** (Client ID) e o **AppSecret** (Client Secret) na página de credenciais do aplicativo

### Stream Mode

O Stream Mode do DingTalk usa uma conexão WebSocket de saída — nenhuma URL pública ou servidor é necessária. O bot se conecta aos servidores do DingTalk, que enviam mensagens através do WebSocket. Este é o modelo de implantação mais simples.

## Configuração

Adicione o canal ao arquivo `~/.qwen/settings.json`:

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "useConnectionManager": true,
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via DingTalk.",
      "groupPolicy": "open",
      "atSender": true,
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

Defina as credenciais como variáveis de ambiente:

```bash
export DINGTALK_CLIENT_ID=<seu-app-key>
export DINGTALK_CLIENT_SECRET=<seu-app-secret>
```

Ou defina-as na seção `env` do `settings.json`:

```json
{
  "env": {
    "DINGTALK_CLIENT_ID": "seu-app-key",
    "DINGTALK_CLIENT_SECRET": "seu-app-secret"
  }
}
```

### Cartões Interativos

Adicione um objeto `interactiveCards` para ativar os cartões de status e
pergunta do DingTalk. Omitir o objeto desativa os cartões interativos. Quando o
objeto está presente, o switch geral e ambos os tipos de cartão ficam habilitados
por padrão, e os cartões de pergunta expiram após 270.000 milissegundos (270
segundos).

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "interactiveCards": {
        "enabled": true,
        "statusCard": { "enabled": true },
        "questionCard": {
          "enabled": true,
          "timeoutMs": 270000
        }
      }
    }
  }
}
```

Defina `interactiveCards.enabled` como `false` para desativar todos os cartões
interativos. Use `statusCard.enabled` ou `questionCard.enabled` para desativar
um tipo de cartão e defina `questionCard.timeoutMs` como um número positivo
finito para alterar o tempo de espera do Qwen Code por uma resposta do cartão
de pergunta. Valores acima de 2.147.483.647 milissegundos (cerca de 24,8 dias)
são limitados a esse máximo. Cartões interativos são configurados via
`settings.json` ou pela API de gerenciamento; o editor de canal Web Shell não
os renderiza e preserva o objeto armazenado ao editar outros campos.

### Recuperação de Conexão

`useConnectionManager` é `true` por padrão. O gerenciador de conexão monitora o WebSocket do Stream e substitui o cliente do SDK do DingTalk quando a conexão para de responder. Normalmente você deve deixá-lo habilitado.

Defina `"useConnectionManager": false` para desativar o gerenciador de conexão do Qwen Code e usar o comportamento de keepalive e reconexão automática do SDK.

## Executando

```bash
# Iniciar apenas o canal DingTalk
qwen channel start my-dingtalk

# Ou iniciar todos os canais configurados juntos
qwen channel start
```

Abra o DingTalk e envie uma mensagem para o bot. Você deve ver uma reação com emoji 👀 aparecer enquanto o agente processa, seguida pela resposta.

## Entrega via Webhook do Daemon

Quando o canal é executado sob `qwen serve`, eventos de Webhook externos autenticados podem acionar tarefas do agente sem supervisão e entregar a resposta final em Markdown para um usuário ou grupo do DingTalk. Use os campos de destino do Webhook existentes; nenhum tipo de canal separado é necessário:

```json
{
  "webhooks": {
    "sources": {
      "manual-test": {
        "secretEnv": "QWEN_CHANNEL_DINGTALK_TEST_SECRET",
        "targets": {
          "operator": {
            "chatId": "DINGTALK_USER_ID",
            "senderId": "webhook:manual-test",
            "isGroup": false
          },
          "team": {
            "chatId": "OPEN_CONVERSATION_ID",
            "senderId": "webhook:manual-test",
            "isGroup": true
          }
        }
      }
    }
  }
}
```

Cada destino deve definir `isGroup` explicitamente. Para mensagens diretas, `chatId` é o ID de usuário do DingTalk do destinatário. Para mensagens em grupo, `chatId` é o `openConversationId` do grupo. Alvos de thread e URLs de Webhook de robô recebido não são suportados para entrega proativa. Consulte [Tarefas acionadas por Webhook](./overview#webhook-triggered-tasks) para a configuração completa do canal e o formato da requisição.

## Conversas em Grupo

Os bots do DingTalk funcionam tanto em conversas DM quanto em grupos. Para habilitar o suporte a grupos:

1. Defina `groupPolicy` como `"allowlist"`, `"pairing"` ou `"open"` na configuração do seu canal
2. Adicione o bot a um grupo do DingTalk
3. Mencione o bot com @ no grupo para acionar uma resposta
4. Se estiver usando `groupPolicy: "pairing"`, aprove a solicitação de pairing do grupo uma vez antes que as respostas comecem

Por padrão, o bot exige menção com @ em conversas de grupo (`requireMention: true`). Defina `"requireMention": false` para um grupo específico para fazê-lo responder a todas as mensagens. Consulte [Conversas em Grupo](./overview#group-chats) para detalhes completos.

Defina `"atSender": true` para que o bot @mencione o membro cuja mensagem no grupo acionou sua resposta. Está desativado por padrão e só se aplica a respostas do agente com um ID de funcionário do DingTalk. As respostas são enviadas como markdown do DingTalk independentemente de conterem uma menção; o prefixo de menção é incluído no primeiro bloco da mensagem.

### Encontrando o ID de Conversa de um Grupo

O DingTalk usa `conversationId` para identificar grupos. Você pode encontrá-lo nos logs do serviço do canal quando alguém envia uma mensagem no grupo — procure pelo campo `conversationId` na saída do log.

## Imagens e Arquivos

Você pode enviar fotos e documentos para o bot, não apenas texto.

**Fotos:** Envie uma imagem (captura de tela, diagrama, etc.) e o agente a analisará usando suas capacidades de visão. Isso requer um modelo multimodal — adicione `"model": "qwen3.5-plus"` (ou outro modelo com capacidade de visão) à configuração do seu canal. O DingTalk suporta o envio de imagens diretamente ou como parte de mensagens de texto rico (texto + imagens misturados).

**Arquivos:** Envie um PDF, arquivo de código ou qualquer documento. O bot baixa o arquivo dos servidores do DingTalk e o salva localmente para que o agente possa lê-lo com suas ferramentas de arquivo. Arquivos de áudio e vídeo também são suportados. Isso funciona com qualquer modelo.

## Principais Diferenças do Telegram

- **Autenticação:** AppKey + AppSecret em vez de um token de bot estático. O SDK gerencia a renovação do token de acesso automaticamente.
- **Conexão:** WebSocket stream em vez de polling — nenhum IP público ou URL de webhook é necessária.
- **Formatação:** As respostas usam o dialeto markdown do DingTalk. Tabelas markdown são enviadas diretamente ao cliente do DingTalk; mensagens longas são divididas em blocos de aproximadamente 3800 caracteres.
- **Indicador de trabalho:** Uma reação com emoji 👀 é adicionada à mensagem do usuário durante o processamento e removida quando a resposta é enviada.
- **Download de mídia:** Processo de duas etapas — um `downloadCode` da mensagem é trocado por uma URL de download temporária através da API do DingTalk.
- **Grupos:** O DingTalk usa `isInAtList` para detecção de menção com @ em vez de analisar entidades de mensagem.

## Dicas

- **Use instruções que considerem o markdown do DingTalk** — O DingTalk suporta cabeçalhos, negrito, links, blocos de código e tabelas. Mantenha as tabelas compactas porque telas estreitas podem rolar horizontalmente.
- **Restrinja o acesso** — Em um contexto organizacional, `senderPolicy: "open"` pode ser aceitável. Para um controle mais rigoroso, use `"allowlist"` ou `"pairing"`. Consulte [Emparelhamento DM](./overview#dm-pairing) para detalhes.
- **Mensagens referenciadas** — Citar (responder a) uma mensagem de usuário inclui o texto citado como contexto para o agente. Se a mensagem citada for uma imagem, arquivo, áudio ou vídeo, o bot a baixa e anexa da mesma forma que quando enviada diretamente. Citar respostas do bot ainda não é suportado.

## Solução de Problemas

### O bot não conecta

- Verifique se seu AppKey e AppSecret estão corretos
- Confirme que as variáveis de ambiente foram definidas antes de executar `qwen channel start`
- Certifique-se de que o **Stream Mode** está habilitado nas configurações do bot no Portal do Desenvolvedor DingTalk
- Verifique a saída do terminal para erros de conexão

### O bot não responde em grupos

- Verifique se `groupPolicy` está definido como `"allowlist"`, `"pairing"` ou `"open"` (o padrão é `"disabled"`)
- Se estiver usando `"pairing"`, verifique se a solicitação de pairing do grupo foi aprovada
- Certifique-se de mencionar o bot com @ na mensagem do grupo
- Verifique se o bot foi adicionado ao grupo

### "No sessionWebhook in message"

Isso significa que o DingTalk não incluiu um endpoint de resposta no callback da mensagem. Pode acontecer se as permissões do bot estiverem mal configuradas. Verifique as configurações do bot no Portal do Desenvolvedor.

### "Sorry, something went wrong processing your message"

Isso geralmente significa que o agente encontrou um erro. Verifique a saída do terminal para obter detalhes.