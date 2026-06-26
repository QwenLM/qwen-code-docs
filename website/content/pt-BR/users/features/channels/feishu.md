# Feishu (Lark)

Este guia cobre a configuração de um canal do Qwen Code no Feishu (飞书) / Lark.

## Pré-requisitos

- Uma conta de organização do Feishu
- Um aplicativo do Feishu com App ID e App Secret (veja abaixo)

## Criando um aplicativo

1. Acesse a [Plataforma Aberta do Feishu](https://open.feishu.cn)
2. Crie um novo aplicativo (ou use um existente)

![](https://gw.alicdn.com/imgextra/i4/O1CN01ORb10i1JM0MQfhnsV_!!6000000001013-2-tps-2219-931.png)

3. No aplicativo, habilite a capacidade **Bot** (添加应用能力 → 机器人)

![](https://gw.alicdn.com/imgextra/i4/O1CN01bClpxu1FZxyH4kNjJ_!!6000000000502-2-tps-2219-931.png)

4. Em **Event Subscriptions** (事件与回调), selecione **Long Connection** (使用长连接接收事件)

![](https://gw.alicdn.com/imgextra/i1/O1CN01uIwzbl1ph8Kwq7hTI_!!6000000005391-2-tps-2219-1166.png)

5. Adicione o evento `im.message.receive_v1` (接收消息)

![](https://gw.alicdn.com/imgextra/i2/O1CN01n7sZmV28s6WX0aDhw_!!6000000007987-2-tps-2219-1090.png)

6. Anote o **App ID** (Client ID) e o **App Secret** (Client Secret) da página de credenciais do aplicativo

![](https://gw.alicdn.com/imgextra/i2/O1CN01ag1yBh1DxfEUb4xmE_!!6000000000283-2-tps-2219-1166.png)

### Permissões necessárias

Ative as seguintes permissões em **Permissions & Scopes** (权限管理):

- `im:message` — Ler e enviar mensagens
- `im:message:send_as_bot` — Enviar mensagens como bot
- `im:resource` — Acessar recursos de mensagens (imagens, arquivos)

### Publique o aplicativo

Após configurar as permissões e eventos, crie uma versão e publique-a. O bot não funcionará até que o aplicativo seja publicado e aprovado.

![](https://gw.alicdn.com/imgextra/i1/O1CN01GbNRcj1lVuACnkV6M_!!6000000004825-2-tps-2219-1090.png)

## Configuração

Adicione o canal ao arquivo `~/.qwen/settings.json`:

```json
{
  "channels": {
    "my-feishu": {
      "type": "feishu",
      "clientId": "<your-app-id>",
      "clientSecret": "<your-app-secret>",
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "groupPolicy": "open",
      "collapsible": true,
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### Opções de configuração

| Opção                 | Descrição                                                                  |
| ---------------------- | -------------------------------------------------------------------------- |
| `clientId`             | App ID do Feishu                                                           |
| `clientSecret`         | App Secret do Feishu                                                       |
| `collapsible`          | Recolher respostas longas em seções expansíveis (padrão: `false`)          |
| `collapsibleThreshold` | Limite de caracteres para recolhimento (padrão: `500`)                     |
| `webhookPort`          | Se definido, usa modo webhook HTTP em vez de WebSocket                     |
| `verificationToken`    | Token de verificação para o modo webhook                                   |
| `encryptKey`           | Chave de criptografia para o modo webhook                                  |

## Executando

```bash
# Iniciar apenas o canal do Feishu
qwen channel start my-feishu

# Ou iniciar todos os canais configurados juntos
qwen channel start
```

Abra o Feishu e envie uma mensagem para o bot. Você verá um cartão interativo com streaming da resposta.

## Modos de conexão

### WebSocket (Padrão)

O modo WebSocket usa uma conexão longa de saída — nenhuma URL pública ou servidor é necessário. Este é o modo recomendado para a maioria das implantações.

### Webhook

Se você precisar do modo webhook (por exemplo, para aplicativos compartilhados), defina `webhookPort` na sua configuração:

```json
{
  "channels": {
    "my-feishu": {
      "type": "feishu",
      "webhookPort": 9321,
      "verificationToken": "<from-feishu-console>",
      "encryptKey": "<from-feishu-console>"
    }
  }
}
```

Em seguida, defina a URL de requisição na Plataforma Aberta do Feishu como `http://<your-server>:9321`.

## Conversas em grupo

Os bots do Feishu funcionam tanto em conversas individuais quanto em grupo. Para ativar o suporte a grupos:

1. Defina `groupPolicy` como `"allowlist"` ou `"open"` na configuração do canal
2. Adicione o bot a um grupo do Feishu
3. Mencione o bot com @ no grupo para acionar uma resposta

Por padrão, o bot exige uma menção @ em conversas de grupo (`requireMention: true`). Defina `"requireMention": false` para um grupo específico para que ele responda a todas as mensagens.

## Funcionalidades

### Streaming com cartão interativo

As respostas são renderizadas como cartões interativos do Feishu com atualizações em tempo real. O cartão mostra um indicador "gerando" enquanto a resposta é produzida e um botão **Stop** para cancelar a geração.

### Contexto de citação/resposta

Quando você responde (cita) a uma mensagem, o conteúdo citado é incluído automaticamente como contexto para o agente. Isso funciona para:

- Mensagens de texto e rich-text
- Cartões interativos (respostas anteriores do bot)

### Imagens e arquivos

Você pode enviar fotos e documentos para o bot:

- **Imagens:** Analisadas usando capacidades de visão multimodal
- **Arquivos:** Baixados e salvos localmente para o agente ler

### Mensagens concorrentes

Vários usuários podem enviar mensagens simultaneamente no mesmo grupo. Cada mensagem recebe seu próprio cartão e resposta independentes — elas não interferem umas nas outras.

## Principais diferenças do DingTalk

- **Formato da resposta:** Usa cartões interativos do Feishu (esquema v2) com renderização nativa de markdown, incluindo tabelas
- **Streaming:** O conteúdo do cartão é atualizado no local com requisições PATCH limitadas (intervalo de 1,5s)
- **Conexão:** WebSocket via `@larksuiteoapi/node-sdk` — mesmo modelo somente de saída, sem necessidade de URL pública
- **Indicador de trabalho:** Uma reação emoji "OnIt" é adicionada enquanto processa
- **Contexto de citação:** Suporta citação tanto de mensagens de texto quanto de cartões interativos

## Solução de problemas

### O bot não conecta

- Verifique se o App ID e o App Secret estão corretos
- Certifique-se de que **Long Connection** está selecionado em Event Subscriptions
- Confira se o evento `im.message.receive_v1` está inscrito
- Verifique a saída do terminal para erros de conexão

### O bot não responde em grupos

- Verifique se `groupPolicy` está definido como `"allowlist"` ou `"open"` (o padrão é `"disabled"`)
- Certifique-se de mencionar o bot com @ na mensagem do grupo
- Verifique se o bot foi adicionado ao grupo

### O cartão permanece no estado "gerando"

- Isso geralmente indica que a resposta foi concluída, mas a atualização final do cartão falhou
- Verifique os logs do terminal para erros de API (limitação de taxa, limites de tamanho do cartão)
- Respostas muito longas com muitas tabelas podem atingir os limites de elementos do cartão do Feishu

### A citação não inclui o conteúdo do cartão

- O bot lê o conteúdo do cartão através do parâmetro de API `card_msg_content_type=user_card_content`
- Garanta que o bot tenha a permissão `im:message` para ler mensagens