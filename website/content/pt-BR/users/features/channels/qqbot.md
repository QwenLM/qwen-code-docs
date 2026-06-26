# QQ Bot (QQ机器人)

Este guia cobre a configuração de um canal Qwen Code no QQ através da API oficial da Plataforma Aberta do QQ Bot.

## Pré-requisitos

- Uma conta QQ (aplicativo móvel para escanear o código QR)

## Configuração

### Login com Código QR

Inicie o canal — na primeira vez, um código QR será exibido. Escaneie-o com seu aplicativo QQ para ativar. Nenhuma conta de desenvolvedor ou registro manual é necessário. As credenciais são salvas e reutilizadas automaticamente.

```json
{
  "channels": {
    "my-qq": {
      "type": "qq"
    }
  }
}
```

```bash
qwen channel start my-qq
# Escaneie o código QR no terminal com seu aplicativo QQ
```

### Configuração Manual (Portal do Desenvolvedor)

Você também pode usar credenciais do portal do desenvolvedor da [Plataforma Aberta do QQ Bot](https://q.qq.com/) se já tiver um aplicativo registrado lá:

```json
{
  "channels": {
    "my-qq": {
      "type": "qq",
      "appID": "YOUR_APP_ID",
      "appSecret": "$QQ_APP_SECRET"
    }
  }
}
```

Defina o segredo como uma variável de ambiente:

```bash
export QQ_APP_SECRET=<your-app-secret>
```

## Configuração

```json
{
  "channels": {
    "my-qq": {
      "type": "qq",
      "appID": "YOUR_APP_ID",
      "appSecret": "$QQ_APP_SECRET",
      "sandbox": false,
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "你是一个通过 QQ Bot 对话的 AI 助手。回复控制在 2000 字符以内。",
      "blockStreaming": "on",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### Opções Específicas do QQ

| Opção        | Padrão   | Descrição                                                                               |
| ------------ | -------- | --------------------------------------------------------------------------------------- |
| `appID`      | —        | AppID do QQ Bot do portal do desenvolvedor. Se omitido, o login por código QR é usado.  |
| `appSecret`  | —        | AppSecret do QQ Bot. Suporta sintaxe `$ENV_VAR`. Se omitido, o login por código QR é usado. |
| `sandbox`    | `false`  | Defina como `true` para usar o ambiente da API sandbox do QQ (`sandbox.api.sgroup.qq.com`) |

Todas as opções padrão de canal (veja [Visão Geral do Canal](./overview#options)) também são suportadas:
`senderPolicy`, `allowedUsers`, `sessionScope`, `cwd`, `instructions`, `groupPolicy`, `groups`, `dispatchMode`, `blockStreaming`, `blockStreamingChunk`, `blockStreamingCoalesce`.

## Executando

```bash
# Iniciar apenas o canal QQ
qwen channel start my-qq

# Ou iniciar todos os canais configurados juntos
qwen channel start
```

Abra o QQ e envie uma mensagem para o seu bot. Você deve ver a resposta chegar no seu chat.

## Grupos

Para usar o bot em grupos do QQ:

1. Defina `groupPolicy` como `"allowlist"` ou `"open"` na configuração do seu canal
2. Adicione o bot a um grupo do QQ através do painel da Plataforma Aberta do QQ Bot ou fazendo com que um administrador do grupo o convide
3. Os membros do grupo devem **@mencionar** o bot para acionar uma resposta

A API V2 do QQ Bot só entrega mensagens de grupo que @mencionam o bot — o bot não vê todas as mensagens do grupo. Por padrão, `requireMention` é `true` e deve permanecer assim para o QQ.

Veja [Grupos](./overview#group-chats) para detalhes completos sobre políticas de grupo e exigência de menção.

## Suporte a Markdown

O canal QQ Bot suporta formatação Markdown (`msg_type=2`). As respostas Markdown do agente são enviadas como estão, e o QQ as renderiza com formatação rica (negrito, itálico, blocos de código, links, listas).

Se o servidor QQ rejeitar uma mensagem Markdown por qualquer motivo, o canal automaticamente a tenta novamente como texto simples — assim suas mensagens sempre passam, mesmo que a capacidade Markdown do bot seja restrita no lado do servidor.

Isto é o oposto do canal WeChat, que remove todo Markdown. Você pode deixar o agente usar Markdown completo com o canal QQ.

## Gerenciamento de Tokens

Os tokens de acesso expiram após aproximadamente 2 horas. O canal os atualiza automaticamente em 80% do TTL (tipicamente ~1,6 horas). Se a atualização falhar, ele tenta novamente após 60 segundos.

A atualização de token continua durante as reconexões WebSocket — o canal nunca fica offline devido a um token expirado enquanto o AppID e AppSecret permanecerem válidos.

## Resiliência de Conexão

- **Reconexão automática:** Em desconexão do WebSocket, o canal tenta novamente com backoff exponencial (até 20 tentativas, máximo de 30 segundos entre tentativas)
- **Retomada de sessão:** Se o WebSocket cair brevemente, o canal usa o código `RESUME` do QQ para restaurar a sessão sem perder mensagens em andamento
- **Continuação de contexto entre servidores:** Sessões de chat e estado de roteamento são persistidos em disco. Se o daemon reiniciar, as conversas continuam de onde pararam
- **Monitoramento de heartbeat:** Timeouts de HEARTBEAT_ACK são detectados e forçam uma reconexão para evitar conexões zumbis
- **Dedup de mensagens:** Mensagens repetidas após uma reconexão são detectadas e ignoradas

## Dicas

- **Use Markdown livremente** — Ao contrário do WeChat, o QQ renderiza Markdown nativamente. Negrito, blocos de código, listas e links funcionam.
- **Mantenha as respostas abaixo de 2000 caracteres** — Respostas mais longas são automaticamente divididas em pedaços. Adicionar uma dica de tamanho às suas instruções ajuda o agente a ser conciso.
- **Sandbox para testes** — Defina `"sandbox": true` para usar a API sandbox durante o desenvolvimento. Nenhuma mensagem de produção será afetada.
- **Restrinja o acesso** — Use `senderPolicy: "allowlist"` para um conjunto fixo de usuários QQ, ou `"pairing"` para aprovar novos usuários a partir da CLI. Veja [Emparelhamento de DM](./overview#dm-pairing) para detalhes.
## Principais Diferenças em Relação ao Telegram

| Área             | QQ Bot                                      | Telegram                                      |
| ---------------- | ------------------------------------------- | --------------------------------------------- |
| Autenticação   | Login via QR code ou AppID/AppSecret            | Token de bot estático do BotFather               |
| Markdown         | Markdown nativo do QQ com fallback para texto simples | Formatado em HTML a partir do Markdown do agente            |
| Ciclo de vida do token | TTL de 2h, renovação automática em 80%                 | Token de bot permanente                           |
| Mensagens em grupo | Apenas mensagens com @menção são entregues ao bot | Bot vê todas as mensagens (com modo de privacidade desativado) |
| Indicador de digitação | Não disponível (limitação da API QQ)           | Mensagem "Working..."                          |
| Modo sandbox     | Suportado para testes                       | Não disponível                                 |

## Solução de Problemas

### Bot não responde

- Verifique a saída do terminal para erros
- Verifique se o canal está em execução (`qwen channel status`)
- Se estiver usando `senderPolicy: "allowlist"`, certifique-se de que seu ID de usuário QQ está em `allowedUsers`
- Na primeira inicialização, um código QR aparecerá no terminal — escaneie-o com seu aplicativo QQ

### Bot não responde em grupos

- Verifique se `groupPolicy` está configurado como `"allowlist"` ou `"open"` (o padrão é `"disabled"`)
- **Você deve @mencionar o bot** — o QQ só entrega mensagens que marcam o bot
- Verifique se o bot foi adicionado ao grupo

### O login via QR code está travado

- O código QR é exibido no terminal. Escaneie-o com seu aplicativo móvel QQ (Eu → Escanear)
- Se o código QR expirar (geralmente após alguns minutos), reinicie o canal para obter um novo

### Mensagens Markdown aparecem como texto simples

- O servidor QQ pode ter rejeitado a mensagem Markdown e o canal silenciosamente retornou ao texto simples. Verifique o terminal em busca de mensagens de log `"Markdown rejected"`
- Isso é incomum na Plataforma Aberta do Bot QQ, mas pode acontecer se a capacidade de Markdown do bot for restrita no lado do servidor

### Token expirou após longo período inativo

- Se o canal ficar offline por mais de 2 horas, o token de acesso terá expirado. O canal obtém um novo token ao reconectar — nenhuma ação necessária
- Se o próprio AppSecret for inválido (por exemplo, alterado no portal do desenvolvedor), atualize o campo `appSecret` ou exclua `~/.qwen/channels/<name>-credentials.json` para reativar o login via QR code
