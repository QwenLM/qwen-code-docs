# DingTalk (Dingtalk)

Este guia aborda a configuração de um canal do Qwen Code no DingTalk (钉钉).

## Pré-requisitos

- Uma conta de organização no DingTalk
- Um aplicativo de bot do DingTalk com AppKey e AppSecret (veja abaixo)

## Criando um Bot

1. Acesse o [Portal de Desenvolvedores do DingTalk](https://open-dev.dingtalk.com)
2. Crie um novo aplicativo (ou use um existente)
3. No aplicativo, ative a capacidade **Robot**
4. Nas configurações do Robot, ative o **Stream Mode** (机器人协议 → Stream 模式)
5. Anote o **AppKey** (Client ID) e o **AppSecret** (Client Secret) na página de credenciais do aplicativo

### Stream Mode

O modo Stream do DingTalk usa uma conexão WebSocket de saída — não é necessário um URL ou servidor público. O bot se conecta aos servidores do DingTalk, que enviam as mensagens por meio do WebSocket. Este é o modelo de implantação mais simples.

## Configuração

Adicione o canal ao `~/.qwen/settings.json`:

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via DingTalk.",
      "groupPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

Defina as credenciais como variáveis de ambiente:

```bash
export DINGTALK_CLIENT_ID=<your-app-key>
export DINGTALK_CLIENT_SECRET=<your-app-secret>
```

Ou defina-as na seção `env` do `settings.json`:

```json
{
  "env": {
    "DINGTALK_CLIENT_ID": "your-app-key",
    "DINGTALK_CLIENT_SECRET": "your-app-secret"
  }
}
```

## Executando

```bash
# Inicia apenas o canal do DingTalk
qwen channel start my-dingtalk

# Ou inicia todos os canais configurados juntos
qwen channel start
```

Abra o DingTalk e envie uma mensagem para o bot. Você deve ver uma reação com o emoji 👀 aparecer enquanto o agente processa, seguida pela resposta.

## Chats em Grupo

Os bots do DingTalk funcionam tanto em DMs quanto em conversas de grupo. Para ativar o suporte a grupos:

1. Defina `groupPolicy` como `"allowlist"` ou `"open"` na configuração do seu canal
2. Adicione o bot a um grupo do DingTalk
3. Mencione o bot no grupo para acionar uma resposta

Por padrão, o bot exige uma menção (@mention) em chats de grupo (`requireMention: true`). Defina `"requireMention": false` para um grupo específico para que ele responda a todas as mensagens. Consulte [Chats em Grupo](./overview#group-chats) para mais detalhes.

### Encontrando o Conversation ID de um Grupo

O DingTalk usa `conversationId` para identificar grupos. Você pode encontrá-lo nos logs do serviço do canal quando alguém envia uma mensagem no grupo — procure pelo campo `conversationId` na saída do log.

## Imagens e Arquivos

Você pode enviar fotos e documentos para o bot, não apenas texto.

**Fotos:** Envie uma imagem (captura de tela, diagrama, etc.) e o agente a analisará usando seus recursos de visão. Isso requer um modelo multimodal — adicione `"model": "qwen3.5-plus"` (ou outro modelo com suporte a visão) à configuração do seu canal. O DingTalk permite enviar imagens diretamente ou como parte de mensagens rich text (texto + imagens misturados).

**Arquivos:** Envie um PDF, arquivo de código ou qualquer documento. O bot faz o download a partir dos servidores do DingTalk e o salva localmente para que o agente possa lê-lo com suas ferramentas de arquivo. Arquivos de áudio e vídeo também são suportados. Isso funciona com qualquer modelo.

## Principais Diferenças em Relação ao Telegram

- **Autenticação:** AppKey + AppSecret em vez de um token de bot estático. O SDK gerencia a atualização do access token automaticamente.
- **Conexão:** Stream WebSocket em vez de polling — não é necessário IP público ou URL de webhook.
- **Formatação:** As respostas usam o dialeto markdown do DingTalk (um subconjunto limitado). As tabelas são convertidas automaticamente para texto simples, pois o DingTalk não as renderiza. Mensagens longas são divididas em blocos de aproximadamente 3800 caracteres.
- **Indicador de processamento:** Uma reação com o emoji 👀 é adicionada à mensagem do usuário durante o processamento e removida quando a resposta é enviada.
- **Download de mídia:** Processo em duas etapas — um `downloadCode` da mensagem é trocado por um URL de download temporário por meio da API do DingTalk.
- **Grupos:** O DingTalk usa `isInAtList` para detecção de @mention em vez de analisar entidades da mensagem.

## Dicas

- **Use instruções compatíveis com markdown do DingTalk** — O DingTalk suporta um subconjunto limitado de markdown (cabeçalhos, negrito, links, blocos de código, mas não tabelas). Adicionar instruções como "Use markdown do DingTalk. Evite tabelas." ajuda o agente a formatar as respostas corretamente.
- **Restrinja o acesso** — Em um contexto organizacional, `senderPolicy: "open"` pode ser aceitável. Para um controle mais rigoroso, use `"allowlist"` ou `"pairing"`. Consulte [Emparelhamento de DM](./overview#dm-pairing) para detalhes.
- **Mensagens referenciadas** — Citar (responder a) uma mensagem de usuário inclui o texto citado como contexto para o agente. Citar respostas do bot ainda não é suportado.

## Solução de Problemas

### O bot não conecta

- Verifique se o AppKey e o AppSecret estão corretos
- Certifique-se de que as variáveis de ambiente estão definidas antes de executar `qwen channel start`
- Verifique se o **Stream Mode** está ativado nas configurações do bot no Portal de Desenvolvedores do DingTalk
- Verifique a saída do terminal em busca de erros de conexão

### O bot não responde em grupos

- Verifique se `groupPolicy` está definido como `"allowlist"` ou `"open"` (o padrão é `"disabled"`)
- Certifique-se de mencionar o bot (@mention) na mensagem do grupo
- Verifique se o bot foi adicionado ao grupo

### "No sessionWebhook in message"

Isso significa que o DingTalk não incluiu um endpoint de resposta no callback da mensagem. Isso pode acontecer se as permissões do bot estiverem configuradas incorretamente. Verifique as configurações do bot no Portal de Desenvolvedores.

### "Sorry, something went wrong processing your message"

Isso geralmente significa que o agente encontrou um erro. Verifique a saída do terminal para mais detalhes.