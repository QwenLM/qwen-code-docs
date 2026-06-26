# Canais

Os canais permitem que você interaja com um agente Qwen Code a partir de plataformas de mensagens como Telegram, WeChat, QQ ou DingTalk, em vez do terminal. Você envia mensagens do seu aplicativo de chat no celular ou desktop, e o agente responde como faria na CLI.

## Como Funciona

Quando você executa `qwen channel start`, o Qwen Code:

1. Lê as configurações dos canais do seu `settings.json`
2. Cria um único processo de agente usando o [Agent Client Protocol (ACP)](../../../developers/architecture.md)
3. Conecta-se a cada plataforma de mensagens e começa a ouvir mensagens
4. Roteia as mensagens recebidas para o agente e envia as respostas de volta para o chat correto

Todos os canais compartilham um processo de agente com sessões isoladas por usuário. Cada canal pode ter seu próprio diretório de trabalho, modelo e instruções.

## Início Rápido

1. Configure um bot na sua plataforma de mensagens (consulte os guias específicos de cada canal: [Telegram](./telegram), [WeChat](./weixin), [QQ Bot](./qqbot), [DingTalk](./dingtalk))
2. Adicione a configuração do canal em `~/.qwen/settings.json`
3. Execute `qwen channel start` para iniciar todos os canais, ou `qwen channel start <nome>` para um único canal

Quer conectar uma plataforma que não está embutida? Veja [Plugins](./plugins) para adicionar um adaptador personalizado como extensão.

## Configuração

Os canais são configurados sob a chave `channels` no `settings.json`. Cada canal possui um nome e um conjunto de opções:

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "token": "$MY_BOT_TOKEN",
      "senderPolicy": "allowlist",
      "allowedUsers": ["123456789"],
      "sessionScope": "user",
      "cwd": "/path/to/working/directory",
      "instructions": "Optional system instructions for the agent.",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### Opções

| Opção                   | Obrigatório | Descrição                                                                                                                                                      |
| ----------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                  | Sim         | Tipo do canal: `telegram`, `weixin`, `qq`, `dingtalk`, `feishu` ou um tipo personalizado de uma extensão (veja [Plugins](./plugins))                            |
| `token`                 | Telegram    | Token do bot. Aceita sintaxe `$ENV_VAR` para ler de variáveis de ambiente. Não necessário para WeChat ou DingTalk                                              |
| `clientId`              | DingTalk    | AppKey do DingTalk. Aceita sintaxe `$ENV_VAR`                                                                                                                  |
| `clientSecret`          | DingTalk    | AppSecret do DingTalk. Aceita sintaxe `$ENV_VAR`                                                                                                               |
| `model`                 | Não         | Modelo a ser usado para este canal (ex.: `qwen3.5-plus`). Substitui o modelo padrão. Útil para modelos multimodais que suportam entrada de imagem              |
| `senderPolicy`          | Não         | Quem pode falar com o bot: `allowlist` (padrão), `open` ou `pairing`                                                                                           |
| `allowedUsers`          | Não         | Lista de IDs de usuários autorizados a usar o bot (usado pelas políticas `allowlist` e `pairing`)                                                              |
| `sessionScope`          | Não         | Como as sessões são delimitadas: `user` (padrão), `thread` ou `single`                                                                                         |
| `cwd`                   | Não         | Diretório de trabalho do agente. Padrão é o diretório atual                                                                                                    |
| `instructions`          | Não         | Instruções personalizadas prefixadas à primeira mensagem de cada sessão                                                                                        |
| `groupPolicy`           | Não         | Acesso a grupos: `disabled` (padrão), `allowlist` ou `open`. Veja [Grupos](#grupos)                                                                            |
| `groups`                | Não         | Configurações por grupo. Chaves são IDs de grupos ou `"*"` para valores padrão. Veja [Grupos](#grupos)                                                         |
| `dispatchMode`          | Não         | O que acontece quando você envia uma mensagem enquanto o bot está ocupado: `steer` (padrão), `collect` ou `followup`. Veja [Modos de Despacho](#modos-de-despacho) |
| `blockStreaming`        | Não         | Entrega progressiva de respostas: `on` ou `off` (padrão). Veja [Streaming em Blocos](#streaming-em-blocos)                                                     |
| `blockStreamingChunk`   | Não         | Limites de tamanho dos blocos: `{ "minChars": 400, "maxChars": 1000 }`. Veja [Streaming em Blocos](#streaming-em-blocos)                                       |
| `blockStreamingCoalesce` | Não        | Liberação por inatividade: `{ "idleMs": 1500 }`. Veja [Streaming em Blocos](#streaming-em-blocos)                                                              |
### Política de Remetente

Controla quem pode interagir com o bot:

- **`allowlist`** (padrão) — Apenas usuários listados em `allowedUsers` podem enviar mensagens. Os demais são silenciosamente ignorados.
- **`pairing`** — Remetentes desconhecidos recebem um código de pareamento. O operador do bot os aprova via CLI e eles são adicionados a uma lista de permissões persistente. Usuários em `allowedUsers` pulam o pareamento completamente. Veja [Pareamento por DM](#dm-pairing) abaixo.
- **`open`** — Qualquer um pode enviar mensagens. Use com cautela.

### Escopo da Sessão

Controla como as sessões de conversa são gerenciadas:

- **`user`** (padrão) — Uma sessão por usuário. Todas as mensagens do mesmo usuário compartilham uma conversa.
- **`thread`** — Uma sessão por thread/tópico. Útil para chats em grupo com threads.
- **`single`** — Uma sessão compartilhada para todos os usuários. Todos compartilham a mesma conversa.

### Segurança do Token

Os tokens do bot não devem ser armazenados diretamente em `settings.json`. Em vez disso, use referências a variáveis de ambiente:

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

Defina o token real no seu ambiente de shell ou em um arquivo `.env` que seja carregado antes de executar o canal.

## Pareamento por DM

Quando `senderPolicy` está definido como `"pairing"`, remetentes desconhecidos passam por um fluxo de aprovação:

1. Um usuário desconhecido envia uma mensagem para o bot
2. O bot responde com um código de pareamento de 8 caracteres (ex.: `VEQDDWXJ`)
3. O usuário compartilha o código com você (o operador do bot)
4. Você o aprova via CLI:

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

Uma vez aprovado, o ID do usuário é salvo em `~/.qwen/channels/<nome>-allowlist.json` e todas as mensagens futuras passam normalmente.

### Comandos CLI de Pareamento

```bash
# List pending pairing requests
qwen channel pairing list my-channel

# Approve a request by code
qwen channel pairing approve my-channel <CODE>
```

### Regras de Pareamento

- Os códigos têm 8 caracteres, maiúsculos, usando um alfabeto sem ambiguidade (sem `0`/`O`/`1`/`I`)
- Os códigos expiram após 1 hora
- Máximo de 3 solicitações pendentes por canal por vez — solicitações adicionais são ignoradas até que uma expire ou seja aprovada
- Usuários listados em `allowedUsers` no `settings.json` sempre pulam o pareamento
- Usuários aprovados são armazenados em `~/.qwen/channels/<nome>-allowlist.json` — trate este arquivo como confidencial

## Chats em Grupo

Por padrão, o bot funciona apenas em mensagens diretas. Para habilitar o suporte a chats em grupo, defina `groupPolicy` como `"allowlist"` ou `"open"`.

### Política de Grupo

Controla se o bot participa de chats em grupo:

- **`disabled`** (padrão) — O bot ignora todas as mensagens de grupo. Opção mais segura.
- **`allowlist`** — O bot responde apenas em grupos explicitamente listados em `groups` pelo ID do chat. A chave `"*"` fornece configurações padrão, mas **não** funciona como uma permissão curinga.
- **`open`** — O bot responde em todos os grupos em que for adicionado. Use com cautela.

### Filtro de Menção

Em grupos, o bot exige uma `@menção` ou uma resposta a uma de suas mensagens por padrão. Isso impede que o bot responda a todas as mensagens em um chat em grupo.

Configure por grupo com a configuração `groups`:

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — Configurações padrão para todos os grupos. Apenas define padrões de configuração, não uma entrada de lista de permissões.
- **ID do chat em grupo** — Substitui as configurações para um grupo específico. Substitui os padrões de `"*"`.
- **`requireMention`** (padrão: `true`) — Quando `true`, o bot responde apenas a mensagens que o @mencionam ou respondem a uma de suas mensagens. Quando `false`, o bot responde a todas as mensagens (útil para grupos de tarefas dedicados).

### Como as mensagens de grupo são avaliadas

```
1. groupPolicy — is this group allowed?           (no → ignore)
2. requireMention — was the bot mentioned/replied to? (no → ignore)
3. senderPolicy — is this sender approved?         (no → pairing flow)
4. Route to session
```

### Configuração do Telegram para Grupos

1. Adicione o bot a um grupo
2. **Desative o modo de privacidade** no BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off) — caso contrário, o bot não verá mensagens que não sejam comandos
3. **Remova e adicione novamente o bot** ao grupo após alterar o modo de privacidade (o Telegram armazena em cache essa configuração)

### Encontrando o ID de um Chat em Grupo

Para encontrar o ID do chat de um grupo para a lista de permissões `groups`:

1. Pare o bot se ele estiver em execução
2. Envie uma mensagem mencionando o bot no grupo
3. Use a API do Telegram Bot para verificar atualizações na fila:

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

Procure por `message.chat.id` na resposta — os IDs de grupo são números negativos (ex.: `-5170296765`).

## Suporte a Mídia

Os canais suportam o envio de imagens e arquivos para o agente, não apenas texto.

### Imagens

Envie uma foto para o bot e o agente a verá — útil para compartilhar capturas de tela, mensagens de erro ou diagramas. A imagem é enviada diretamente ao modelo como uma entrada de visão.

Para usar o suporte a imagens, configure um modelo multimodal para o canal:

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "model": "qwen3.5-plus",
      ...
    }
  }
}
```
### Arquivos

Envie um documento (PDF, arquivo de código, arquivo de texto, etc.) para o bot. O arquivo é baixado e salvo em um diretório temporário, e o agente recebe o caminho do arquivo para que possa ler o conteúdo usando suas ferramentas de leitura de arquivos.

Arquivos funcionam com qualquer modelo — não é necessário suporte multimodal.

### Diferenças entre plataformas

| Funcionalidade | Telegram                                     | WeChat                           | DingTalk                                      |
| -------------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| Imagens        | Download direto via API do Bot               | Download via CDN com descriptografia AES | API downloadCode (duas etapas)                |
| Arquivos       | Download direto via API do Bot (limite 20 MB) | Download via CDN com descriptografia AES | API downloadCode (duas etapas)                |
| Legendas       | Legendas de fotos/arquivos incluídas como texto da mensagem | Não aplicável                   | Texto formatado: texto e imagens misturados em uma única mensagem |

## Modos de Despacho

Controla o que acontece quando você envia uma nova mensagem enquanto o bot ainda está processando uma anterior.

- **`steer`** (padrão) — O bot cancela a requisição atual e começa a trabalhar na sua nova mensagem. Melhor para chat normal, onde uma mensagem de acompanhamento geralmente significa que você quer corrigir ou redirecionar o bot.
- **`collect`** — Suas novas mensagens são armazenadas em buffer. Quando a requisição atual termina, todas as mensagens em buffer são combinadas em um único prompt de acompanhamento. Bom para fluxos de trabalho assíncronos onde você quer enfileirar ideias.
- **`followup`** — Cada mensagem é enfileirada e processada como sua própria rodada separada, em ordem. Útil para fluxos de trabalho em lote onde cada mensagem é independente.

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "dispatchMode": "steer",
      ...
    }
  }
}
```

Você também pode definir o modo de despacho por grupo, sobrescrevendo o padrão do canal:

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## Streaming de Blocos

Por padrão, o agente trabalha por um tempo e depois envia uma resposta grande. Com o streaming de blocos habilitado, a resposta chega como várias mensagens mais curtas enquanto o agente ainda está trabalhando — similar a como ChatGPT ou Claude mostram saída progressiva.

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "blockStreaming": "on",
      "blockStreamingChunk": { "minChars": 400, "maxChars": 1000 },
      "blockStreamingCoalesce": { "idleMs": 1500 },
      ...
    }
  }
}
```

### Como funciona

- A resposta do agente é dividida em blocos nos limites de parágrafo e enviada como mensagens separadas
- `minChars` (padrão 400) — não envia um bloco até que tenha pelo menos esse tamanho, para evitar enviar mensagens minúsculas
- `maxChars` (padrão 1000) — se um bloco ficar com esse tamanho sem uma quebra natural, envia mesmo assim
- `idleMs` (padrão 1500) — se o agente pausar (por exemplo, executando uma ferramenta), envia o que foi armazenado em buffer até agora
- Quando o agente termina, qualquer texto restante é enviado imediatamente

Apenas `blockStreaming` é obrigatório. As configurações de chunk e coalesce são opcionais e têm valores padrão sensatos.

## Comandos de Barra

Canais suportam comandos de barra. Eles são processados localmente (sem ida e volta ao agente):

- `/help` — Lista os comandos disponíveis
- `/clear` — Limpa sua sessão e começa do zero (aliases: `/reset`, `/new`)
- `/status` — Mostra informações da sessão e política de acesso

Todos os outros comandos de barra (ex.: `/compress`, `/summary`) são encaminhados para o agente.

Esses comandos funcionam em todos os tipos de canal (Telegram, WeChat, QQ, DingTalk).

## Executando

```bash
# Start all configured channels (shared agent process)
qwen channel start

# Start a single channel
qwen channel start my-channel

# Check if the service is running
qwen channel status

# Stop the running service
qwen channel stop
```

O bot roda em primeiro plano. Pressione `Ctrl+C` para parar, ou use `qwen channel stop` de outro terminal.

### Modo Multicanal

Quando você executa `qwen channel start` sem um nome, todos os canais definidos em `settings.json` iniciam juntos compartilhando um único processo de agente. Cada canal mantém suas próprias sessões — um usuário do Telegram e um usuário do WeChat têm conversas separadas, mesmo que compartilhem o mesmo agente.

Cada canal usa seu próprio `cwd` da sua configuração, então canais diferentes podem trabalhar em projetos diferentes simultaneamente.

### Gerenciamento do Serviço

O serviço de canal usa um arquivo PID (`~/.qwen/channels/service.pid`) para rastrear a instância em execução:

- **Prevenção de duplicatas**: Executar `qwen channel start` enquanto um serviço já está rodando exibirá um erro em vez de iniciar uma segunda instância
- **`qwen channel stop`**: Para graciosamente o serviço em execução a partir de outro terminal
- **`qwen channel status`**: Mostra se o serviço está rodando, seu tempo de atividade e contagens de sessão por canal

### Recuperação de Falhas

Se o processo do agente falhar inesperadamente, o serviço de canal o reinicia automaticamente e tenta restaurar todas as sessões ativas. Os usuários podem continuar suas conversas sem recomeçar.
- Sessões são persistidas em `~/.qwen/channels/sessions.json` enquanto o serviço está em execução
- Em caso de falha: o agente reinicia em até 3 segundos e recarrega as sessões salvas
- Após 3 falhas consecutivas, o serviço é encerrado com um erro
- Em um desligamento limpo (Ctrl+C ou `qwen channel stop`): os dados da sessão são limpos — a próxima inicialização é sempre nova
