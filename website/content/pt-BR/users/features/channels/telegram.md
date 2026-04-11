# Telegram

Este guia aborda a configuração de um canal do Qwen Code no Telegram.

## Pré-requisitos

- Uma conta no Telegram
- Um token de bot do Telegram (veja abaixo)

## Criando um Bot

1. Abra o Telegram e pesquise por [@BotFather](https://t.me/BotFather)
2. Envie `/newbot` e siga as instruções para escolher um nome e um nome de usuário
3. O BotFather fornecerá um token de bot — salve-o de forma segura

## Encontrando seu ID de usuário

Para usar `senderPolicy: "allowlist"` ou `"pairing"`, você precisa do seu ID de usuário do Telegram (um ID numérico, não seu nome de usuário).

A maneira mais fácil de encontrá-lo:

1. Pesquise por [@userinfobot](https://t.me/userinfobot) no Telegram
2. Envie qualquer mensagem para ele — ele responderá com seu ID de usuário

## Configuração

Adicione o canal ao `~/.qwen/settings.json`:

```json
{
  "channels": {
    "my-telegram": {
      "type": "telegram",
      "token": "$TELEGRAM_BOT_TOKEN",
      "senderPolicy": "allowlist",
      "allowedUsers": ["YOUR_USER_ID"],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via Telegram. Keep responses short.",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

Defina o token do bot como uma variável de ambiente:

```bash
export TELEGRAM_BOT_TOKEN=<your-token-from-botfather>
```

Ou adicione-o a um arquivo `.env` que seja carregado antes da execução.

## Executando

```bash
# Inicia apenas o canal do Telegram
qwen channel start my-telegram

# Ou inicia todos os canais configurados juntos
qwen channel start
```

Em seguida, abra seu bot no Telegram e envie uma mensagem. Você deve ver "Working..." aparecer imediatamente, seguido pela resposta do agente.

## Chats em Grupo

Para usar o bot em grupos do Telegram:

1. Defina `groupPolicy` como `"allowlist"` ou `"open"` na configuração do seu canal
2. **Desative o modo de privacidade** no BotFather: `/mybots` → selecione seu bot → Bot Settings → Group Privacy → Turn Off
3. Adicione o bot a um grupo. Se ele já estiver no grupo, **remova e adicione-o novamente** (o Telegram armazena em cache as configurações de privacidade do momento em que o bot entrou)
4. Se estiver usando `groupPolicy: "allowlist"`, adicione o ID do chat do grupo a `groups` na sua configuração

Por padrão, o bot requer um @mention ou uma resposta para interagir em grupos. Defina `"requireMention": false` para um grupo específico para que ele responda a todas as mensagens (útil para grupos dedicados a tarefas). Consulte [Group Chats](./overview#group-chats) para mais detalhes.

## Imagens e Arquivos

Você pode enviar fotos e documentos para o bot, não apenas texto.

**Fotos:** Envie uma foto e o agente a analisará usando seus recursos de visão. Isso requer um modelo multimodal — adicione `"model": "qwen3.5-plus"` (ou outro modelo com capacidade de visão) à configuração do seu canal. As legendas das fotos são passadas como texto da mensagem.

**Documentos:** Envie um PDF, arquivo de código ou qualquer outro documento. O bot faz o download e o salva localmente para que o agente possa lê-lo com suas ferramentas de arquivo. Isso funciona com qualquer modelo. O limite de tamanho de arquivo do Telegram é de 20 MB.

## Dicas

- **Mantenha as instruções focadas em concisão** — o Telegram tem um limite de 4096 caracteres por mensagem. Adicionar instruções como "mantenha as respostas curtas" ajuda o agente a permanecer dentro dos limites.
- **Use `sessionScope: "user"`** — Isso dá a cada usuário sua própria conversa. Use `/clear` para começar do zero.
- **Restrinja o acesso** — Use `senderPolicy: "allowlist"` para um conjunto fixo de usuários, ou `"pairing"` para permitir que novos usuários solicitem acesso com um código que você aprova via CLI. Consulte [DM Pairing](./overview#dm-pairing) para detalhes.

## Formatação de Mensagens

As respostas em markdown do agente são convertidas automaticamente para HTML compatível com o Telegram. Blocos de código, negrito, itálico, links e listas são todos suportados.

## Solução de Problemas

### O bot não responde

- Verifique se o token do bot está correto e se a variável de ambiente está definida
- Verifique se seu ID de usuário está em `allowedUsers` se estiver usando `senderPolicy: "allowlist"`, ou se você foi aprovado se estiver usando `"pairing"`
- Verifique a saída do terminal em busca de erros

### O bot não responde em grupos

- Verifique se `groupPolicy` está definido como `"allowlist"` ou `"open"` (o padrão é `"disabled"`)
- Se estiver usando `"allowlist"`, verifique se o ID do chat do grupo está na configuração `groups`
- Certifique-se de que **Group Privacy está desativado** no BotFather — sem isso, o bot não consegue ver mensagens que não sejam comandos em grupos
- Se você alterou o modo de privacidade depois de adicionar o bot a um grupo, **remova e adicione o bot novamente** ao grupo
- Por padrão, o bot requer um @mention ou uma resposta. Envie `@yourbotname hello` para testar

### "Desculpe, algo deu errado ao processar sua mensagem"

Isso geralmente significa que o agente encontrou um erro. Verifique a saída do terminal para obter detalhes.

### O bot demora para responder

O agente pode estar executando várias chamadas de ferramentas (lendo arquivos, pesquisando, etc.). O indicador "Working..." aparece enquanto o agente está processando. Tarefas complexas podem levar um minuto ou mais.