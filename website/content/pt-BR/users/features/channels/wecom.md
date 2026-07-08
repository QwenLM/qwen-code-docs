# WeCom (WeChat Empresarial)

Este guia aborda a configuração do Qwen Code com um robô inteligente do WeCom.

## Pré-requisitos

- Uma conta de organização do WeCom
- Um robô inteligente do WeCom criado no modo API
- O Bot ID e o Secret do robô

## Criando o Robô

1. Abra o console de administração do WeCom e crie um robô inteligente.
2. Escolha o modo API.
3. Copie o Bot ID e o Secret.
4. Adicione o robô aos chats diretos ou grupos onde ele deve estar disponível.

O robô inteligente usa uma conexão WebSocket do Qwen Code para o WeCom. Você não precisa de uma URL de callback pública, Token, EncodingAESKey, Corp ID ou Agent ID.

## Configuração

Adicione o canal ao `~/.qwen/settings.json`:

```json
{
  "channels": {
    "my-wecom": {
      "type": "wecom",
      "botId": "$WECOM_BOT_ID",
      "secret": "$WECOM_SECRET",
      "senderPolicy": "allowlist",
      "allowedUsers": ["zhangsan"],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via WeCom.",
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
export WECOM_BOT_ID=<your-bot-id>
export WECOM_SECRET=<your-secret>
```

Ou defina-as na seção `env` do `settings.json`:

```json
{
  "env": {
    "WECOM_BOT_ID": "your-bot-id",
    "WECOM_SECRET": "your-secret"
  }
}
```

## Executando

```bash
qwen channel start my-wecom
```

Abra o WeCom e envie uma mensagem para o robô inteligente.

## Controle de Acesso

`senderPolicy` funciona da mesma forma que em outros canais de IM:

- `allowlist`: apenas usuários em `allowedUsers` podem usar o bot. Este é o padrão recomendado para empresas.
- `pairing`: os usuários devem fazer o pareamento antes de usar o bot.
- `open`: qualquer pessoa que possa enviar mensagens para o robô pode usá-lo.

Para grupos, defina `groupPolicy` como `"allowlist"` ou `"open"`. Por padrão, as mensagens de grupo exigem uma menção através de `"requireMention": true`.

Quando o SDK do WeCom inclui metadados de menção explícitos, o Qwen Code os usa para essa verificação. Se não houver metadados de menção, o canal trata as mensagens de grupo entregues como não mencionadas. Defina `"requireMention": false` apenas se você quiser depender do escopo de entrega do lado do WeCom.

## Imagens e Arquivos

Os usuários podem enviar texto, mensagens de voz com transcrição, imagens, texto misturado com imagens, arquivos e vídeos. As imagens são passadas para o agente como anexos de imagem. Arquivos e vídeos são baixados para caminhos locais temporários para que o agente possa lê-los com ferramentas de arquivo.

As respostas do assistente são enviadas como markdown do WeCom. Para enviar uma imagem local gerada pelo agente, inclua um marcador fora dos blocos de código:

```text
[IMAGE: /absolute/path/to/image.png]
```

Por segurança, os caminhos das imagens locais devem estar dentro do diretório de arquivos do canal no diretório temporário do sistema, como `/tmp/channel-files/...` no Linux. Marcadores genéricos de upload de arquivos, vídeos e voz são ignorados, pois os caminhos de arquivo produzidos pelo modelo poderiam, de outra forma, fazer upload de arquivos arbitrários do workspace.

## Solução de Problemas

### O bot não conecta

- Verifique o Bot ID e o Secret.
- Certifique-se de que o robô foi criado no modo API.
- Verifique se as variáveis de ambiente estão disponíveis no shell que executa `qwen channel start`.

### O bot não responde em grupos

- Verifique o `groupPolicy`.
- Mencione o bot, a menos que a configuração do grupo defina `"requireMention": false`.
- Confirme se o robô foi adicionado ao grupo.

### As credenciais do aplicativo próprio não funcionam

Este canal é para robôs inteligentes do WeCom. As credenciais de callback de aplicativos próprios, como Corp ID, Agent ID, Token e EncodingAESKey, não são usadas por este canal.