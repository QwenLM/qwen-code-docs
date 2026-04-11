# Canais

Os canais permitem interagir com um agente do Qwen Code por meio de plataformas de mensagens como Telegram, WeChat ou DingTalk, em vez do terminal. Você envia mensagens pelo aplicativo de chat no celular ou desktop, e o agente responde da mesma forma que faria na CLI.

## Como Funciona

Ao executar `qwen channel start`, o Qwen Code:

1. Lê as configurações de canal do seu `settings.json`
2. Inicia um único processo de agente usando o [Agent Client Protocol (ACP)](../../developers/architecture)
3. Conecta-se a cada plataforma de mensagens e começa a escutar novas mensagens
4. Roteia as mensagens recebidas para o agente e envia as respostas de volta para o chat correto

Todos os canais compartilham um único processo de agente com sessões isoladas por usuário. Cada canal pode ter seu próprio diretório de trabalho, modelo e instruções.

## Início Rápido

1. Configure um bot na sua plataforma de mensagens (consulte os guias específicos: [Telegram](./telegram), [WeChat](./weixin), [DingTalk](./dingtalk))
2. Adicione a configuração do canal ao `~/.qwen/settings.json`
3. Execute `qwen channel start` para iniciar todos os canais ou `qwen channel start <name>` para um único canal

Quer conectar uma plataforma que ainda não tem suporte nativo? Consulte [Plugins](./plugins) para adicionar um adaptador personalizado como extensão.

## Configuração

Os canais são configurados na chave `channels` do `settings.json`. Cada canal possui um nome e um conjunto de opções:

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

| Opção                    | Obrigatório | Descrição                                                                                                                                    |
| ------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | Sim         | Tipo do canal: `telegram`, `weixin`, `dingtalk` ou um tipo personalizado de uma extensão (consulte [Plugins](./plugins))                     |
| `token`                  | Telegram    | Token do bot. Suporta a sintaxe `$ENV_VAR` para ler variáveis de ambiente. Não é necessário para WeChat ou DingTalk                          |
| `clientId`               | DingTalk    | AppKey do DingTalk. Suporta a sintaxe `$ENV_VAR`                                                                                             |
| `clientSecret`           | DingTalk    | AppSecret do DingTalk. Suporta a sintaxe `$ENV_VAR`                                                                                          |
| `model`                  | Não         | Modelo a ser usado neste canal (ex.: `qwen3.5-plus`). Substitui o modelo padrão. Útil para modelos multimodais que suportam entrada de imagens |
| `senderPolicy`           | Não         | Quem pode falar com o bot: `allowlist` (padrão), `open` ou `pairing`                                                                         |
| `allowedUsers`           | Não         | Lista de IDs de usuários autorizados a usar o bot (usado pelas políticas `allowlist` e `pairing`)                                            |
| `sessionScope`           | Não         | Como as sessões são escopadas: `user` (padrão), `thread` ou `single`                                                                         |
| `cwd`                    | Não         | Diretório de trabalho para o agente. O padrão é o diretório atual                                                                            |
| `instructions`           | Não         | Instruções personalizadas adicionadas no início da primeira mensagem de cada sessão                                                          |
| `groupPolicy`            | Não         | Acesso a chats em grupo: `disabled` (padrão), `allowlist` ou `open`. Consulte [Chats em Grupo](#group-chats)                                 |
| `groups`                 | Não         | Configurações por grupo. As chaves são IDs de chats em grupo ou `"*"` para padrões. Consulte [Chats em Grupo](#group-chats)                  |
| `dispatchMode`           | Não         | O que acontece ao enviar uma mensagem enquanto o bot está ocupado: `steer` (padrão), `collect` ou `followup`. Consulte [Modos de Despacho](#dispatch-modes) |
| `blockStreaming`         | Não         | Entrega progressiva de respostas: `on` ou `off` (padrão). Consulte [Streaming em Blocos](#block-streaming)                                   |
| `blockStreamingChunk`    | Não         | Limites de tamanho do bloco: `{ "minChars": 400, "maxChars": 1000 }`. Consulte [Streaming em Blocos](#block-streaming)                       |
| `blockStreamingCoalesce` | Não         | Flush em inatividade: `{ "idleMs": 1500 }`. Consulte [Streaming em Blocos](#block-streaming)                                                 |

### Política de Remetente

Controla quem pode interagir com o bot:

- **`allowlist`** (padrão) — Apenas usuários listados em `allowedUsers` podem enviar mensagens. Outros são ignorados silenciosamente.
- **`pairing`** — Remetentes desconhecidos recebem um código de pareamento. O operador do bot os aprova via CLI e eles são adicionados a uma allowlist persistente. Usuários em `allowedUsers` pulam o pareamento completamente. Consulte [Pareamento por DM](#dm-pairing) abaixo.
- **`open`** — Qualquer pessoa pode enviar mensagens. Use com cuidado.

### Escopo da Sessão

Controla como as sessões de conversa são gerenciadas:

- **`user`** (padrão) — Uma sessão por usuário. Todas as mensagens do mesmo usuário compartilham a mesma conversa.
- **`thread`** — Uma sessão por thread/tópico. Útil para chats em grupo com threads.
- **`single`** — Uma sessão compartilhada para todos os usuários. Todos compartilham a mesma conversa.

### Segurança do Token

Os tokens do bot não devem ser armazenados diretamente no `settings.json`. Em vez disso, use referências a variáveis de ambiente:

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

Defina o token real no ambiente do seu shell ou em um arquivo `.env` que seja carregado antes de executar o canal.

## Pareamento por DM

Quando `senderPolicy` está definido como `"pairing"`, remetentes desconhecidos passam por um fluxo de aprovação:

1. Um usuário desconhecido envia uma mensagem para o bot
2. O bot responde com um código de pareamento de 8 caracteres (ex.: `VEQDDWXJ`)
3. O usuário compartilha o código com você (operador do bot)
4. Você o aprova via CLI:

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

Após a aprovação, o ID do usuário é salvo em `~/.qwen/channels/<name>-allowlist.json` e todas as mensagens futuras são processadas normalmente.

### Comandos CLI de Pareamento

```bash
# Listar solicitações de pareamento pendentes
qwen channel pairing list my-channel

# Aprovar uma solicitação por código
qwen channel pairing approve my-channel <CODE>
```

### Regras de Pareamento

- Os códigos têm 8 caracteres, em maiúsculas, usando um alfabeto sem ambiguidade (sem `0`/`O`/`1`/`I`)
- Os códigos expiram após 1 hora
- Máximo de 3 solicitações pendentes por canal por vez — solicitações adicionais são ignoradas até que uma expire ou seja aprovada
- Usuários listados em `allowedUsers` no `settings.json` sempre pulam o pareamento
- Usuários aprovados são armazenados em `~/.qwen/channels/<name>-allowlist.json` — trate este arquivo como sensível

## Chats em Grupo

Por padrão, o bot funciona apenas em mensagens diretas. Para habilitar o suporte a chats em grupo, defina `groupPolicy` como `"allowlist"` ou `"open"`.

### Política de Grupo

Controla se o bot participa de chats em grupo:

- **`disabled`** (padrão) — O bot ignora todas as mensagens de grupo. Opção mais segura.
- **`allowlist`** — O bot responde apenas em grupos explicitamente listados em `groups` pelo ID do chat. A chave `"*"` fornece configurações padrão, mas **não** atua como um curinga para permitir acesso.
- **`open`** — O bot responde em todos os grupos aos quais é adicionado. Use com cuidado.

### Controle por Menção

Em grupos, o bot exige um `@mention` ou uma resposta a uma de suas mensagens por padrão. Isso impede que o bot responda a todas as mensagens em um chat de grupo.

Configure por grupo com a opção `groups`:

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — Configurações padrão para todos os grupos. Define apenas padrões de configuração, não uma entrada na allowlist.
- **ID do chat em grupo** — Substitui as configurações para um grupo específico. Substitui os padrões de `"*"`.
- **`requireMention`** (padrão: `true`) — Quando `true`, o bot responde apenas a mensagens que o @mencionam ou respondem a uma de suas mensagens. Quando `false`, o bot responde a todas as mensagens (útil para grupos dedicados a tarefas).

### Como as mensagens de grupo são avaliadas

```
1. groupPolicy — este grupo tem permissão?           (não → ignorar)
2. requireMention — o bot foi mencionado/respondido? (não → ignorar)
3. senderPolicy — este remetente está aprovado?      (não → fluxo de pareamento)
4. Roteia para a sessão
```

### Configuração do Telegram para Grupos

1. Adicione o bot a um grupo
2. **Desative o modo de privacidade** no BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off) — caso contrário, o bot não verá mensagens que não sejam comandos
3. **Remova e readicione o bot** ao grupo após alterar o modo de privacidade (o Telegram armazena essa configuração em cache)

### Encontrando o ID de um Chat em Grupo

Para encontrar o ID do chat de um grupo para a allowlist `groups`:

1. Pare o bot se ele estiver em execução
2. Envie uma mensagem mencionando o bot no grupo
3. Use a API do Bot do Telegram para verificar atualizações na fila:

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

Procure por `message.chat.id` na resposta — IDs de grupo são números negativos (ex.: `-5170296765`).

## Suporte a Mídia

Os canais suportam o envio de imagens e arquivos para o agente, não apenas texto.

### Imagens

Envie uma foto para o bot e o agente a verá — útil para compartilhar capturas de tela, mensagens de erro ou diagramas. A imagem é enviada diretamente ao modelo como entrada de visão.

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

| Recurso  | Telegram                                     | WeChat                           | DingTalk                                      |
| -------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| Imagens  | Download direto via Bot API                  | Download via CDN com descriptografia AES | API downloadCode (duas etapas)                |
| Arquivos | Download direto via Bot API (limite de 20MB) | Download via CDN com descriptografia AES | API downloadCode (duas etapas)                |
| Legendas | Legendas de fotos/arquivos incluídas como texto da mensagem | Não aplicável                    | Texto rico: texto misturado + imagens em uma única mensagem |

## Modos de Despacho

Controla o que acontece quando você envia uma nova mensagem enquanto o bot ainda está processando uma anterior.

- **`steer`** (padrão) — O bot cancela a solicitação atual e começa a trabalhar na sua nova mensagem. Ideal para chats normais, onde um acompanhamento geralmente significa que você quer corrigir ou redirecionar o bot.
- **`collect`** — Suas novas mensagens são armazenadas em buffer. Quando a solicitação atual termina, todas as mensagens em buffer são combinadas em um único prompt de acompanhamento. Bom para fluxos assíncronos onde você quer enfileirar ideias.
- **`followup`** — Cada mensagem é enfileirada e processada como sua própria vez separada, em ordem. Útil para fluxos em lote onde cada mensagem é independente.

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

Você também pode definir o modo de despacho por grupo, substituindo o padrão do canal:

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## Streaming em Blocos

Por padrão, o agente trabalha por um tempo e depois envia uma única resposta grande. Com o streaming em blocos ativado, a resposta chega como várias mensagens mais curtas enquanto o agente ainda está trabalhando — semelhante a como o ChatGPT ou o Claude mostram a saída progressiva.

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

- A resposta do agente é dividida em blocos nos limites dos parágrafos e enviada como mensagens separadas
- `minChars` (padrão 400) — não envia um bloco até que ele atinja esse tamanho, para evitar spam de mensagens minúsculas
- `maxChars` (padrão 1000) — se um bloco atingir esse tamanho sem uma quebra natural, ele é enviado mesmo assim
- `idleMs` (padrão 1500) — se o agente pausar (ex.: executando uma ferramenta), envia o que está em buffer até o momento
- Quando o agente termina, qualquer texto restante é enviado imediatamente

Apenas `blockStreaming` é obrigatório. As configurações de chunk e coalesce são opcionais e possuem padrões sensatos.

## Comandos com Barra

Os canais suportam comandos com barra. Eles são processados localmente (sem ida e volta ao agente):

- `/help` — Lista os comandos disponíveis
- `/clear` — Limpa sua sessão e começa do zero (aliases: `/reset`, `/new`)
- `/status` — Mostra informações da sessão e política de acesso

Todos os outros comandos com barra (ex.: `/compress`, `/summary`) são encaminhados ao agente.

Esses comandos funcionam em todos os tipos de canal (Telegram, WeChat, DingTalk).

## Execução

```bash
# Iniciar todos os canais configurados (processo de agente compartilhado)
qwen channel start

# Iniciar um único canal
qwen channel start my-channel

# Verificar se o serviço está em execução
qwen channel status

# Parar o serviço em execução
qwen channel stop
```

O bot é executado em primeiro plano. Pressione `Ctrl+C` para parar ou use `qwen channel stop` em outro terminal.

### Modo Multicanal

Ao executar `qwen channel start` sem um nome, todos os canais definidos no `settings.json` são iniciados juntos, compartilhando um único processo de agente. Cada canal mantém suas próprias sessões — um usuário do Telegram e um do WeChat têm conversas separadas, mesmo compartilhando o mesmo agente.

Cada canal usa seu próprio `cwd` da configuração, permitindo que diferentes canais trabalhem em projetos distintos simultaneamente.

### Gerenciamento do Serviço

O serviço de canal usa um arquivo PID (`~/.qwen/channels/service.pid`) para rastrear a instância em execução:

- **Prevenção de duplicatas**: Executar `qwen channel start` enquanto um serviço já está em execução mostrará um erro em vez de iniciar uma segunda instância
- **`qwen channel stop`**: Para o serviço em execução de forma graciosa a partir de outro terminal
- **`qwen channel status`**: Mostra se o serviço está em execução, seu tempo de atividade e a contagem de sessões por canal

### Recuperação de Falhas

Se o processo do agente falhar inesperadamente, o serviço de canal o reinicia automaticamente e tenta restaurar todas as sessões ativas. Os usuários podem continuar suas conversas sem precisar começar do zero.

- As sessões são persistidas em `~/.qwen/channels/sessions.json` enquanto o serviço está em execução
- Em caso de falha: o agente reinicia em até 3 segundos e recarrega as sessões salvas
- Após 3 falhas consecutivas, o serviço é encerrado com um erro
- No encerramento limpo (Ctrl+C ou `qwen channel stop`): os dados da sessão são limpos — a próxima inicialização será sempre do zero