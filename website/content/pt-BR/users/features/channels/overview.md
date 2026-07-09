# Canais

Os canais permitem que você interaja com um agente do Qwen Code a partir de plataformas de mensagens como Telegram, WeChat, QQ, DingTalk ou Feishu, em vez do terminal. Você envia mensagens do seu celular ou aplicativo de chat no desktop, e o agente responde exatamente como faria na CLI.

## Como Funciona

Ao executar `qwen channel start`, o Qwen Code:

1. Lê as configurações de canais do seu `settings.json`
2. Inicia um único processo de agente usando o [Agent Client Protocol (ACP)](../../../developers/architecture.md)
3. Conecta-se a cada plataforma de mensagens e começa a ouvir as mensagens
4. Roteia as mensagens recebidas para o agente e envia as respostas de volta para o chat correto

Todos os canais compartilham um único processo de agente com sessões isoladas por usuário. Cada canal pode ter seu próprio diretório de trabalho, modelo e instruções.

## Início Rápido

1. Configure um bot na sua plataforma de mensagens (consulte os guias específicos de cada canal: [Telegram](./telegram), [WeChat](./weixin), [QQ Bot](./qqbot), [DingTalk](./dingtalk), [Feishu](./feishu))
2. Adicione a configuração do canal em `~/.qwen/settings.json`
3. Execute `qwen channel start` para iniciar todos os canais, ou `qwen channel start <name>` para um único canal

Quer conectar uma plataforma que não é nativa? Consulte [Plugins](./plugins) para adicionar um adaptador personalizado como uma extensão.

## Configuração

Os canais são configurados sob a chave `channels` no `settings.json`. Cada canal tem um nome e um conjunto de opções:

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

| Opção                    | Obrigatório      | Descrição                                                                                                                                                            |
| ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | Sim              | Tipo de canal: `telegram`, `weixin`, `qq`, `dingtalk`, `feishu` ou um tipo personalizado de uma extensão (consulte [Plugins](./plugins))                                          |
| `token`                  | Telegram         | Token do bot. Suporta a sintaxe `$ENV_VAR` para ler de variáveis de ambiente. Não é necessário para WeChat, DingTalk ou Feishu                                                   |
| `clientId`               | DingTalk, Feishu | AppKey do DingTalk ou App ID do Feishu. Suporta a sintaxe `$ENV_VAR`                                                                                                           |
| `clientSecret`           | DingTalk, Feishu | AppSecret do DingTalk ou App Secret do Feishu. Suporta a sintaxe `$ENV_VAR`                                                                                                    |
| `model`                  | Não              | Modelo a ser usado para este canal (por exemplo, `qwen3.5-plus`). Substitui o modelo padrão. Útil para modelos multimodais que suportam entrada de imagens                               |
| `senderPolicy`           | Não              | Quem pode falar com o bot: `allowlist` (padrão), `open` ou `pairing`                                                                                                   |
| `allowedUsers`           | Não              | Lista de IDs de usuários autorizados a usar o bot (usado pelas políticas `allowlist` e `pairing`)                                                                                   |
| `sessionScope`           | Não              | Como as sessões são delimitadas: `user` (padrão), `thread` ou `single`                                                                                                       |
| `cwd`                    | Não              | Diretório de trabalho para o agente. O padrão é o diretório atual                                                                                                     |
| `instructions`           | Não              | Instruções personalizadas adicionadas no início da primeira mensagem de cada sessão                                                                                                     |
| `groupPolicy`            | Não              | Acesso a chats em grupo: `disabled` (padrão), `allowlist` ou `open`. Consulte [Chats em Grupo](#group-chats)                                                                       |
| `groupHistoryLimit`      | Não              | Preenchimento retroativo opt-in do histórico do grupo. `0` ou omitido desativa. Um número positivo persiste essa quantidade de mensagens de grupo autorizadas e não mencionadas para a próxima menção/resposta do bot. |
| `groups`                 | Não              | Configurações por grupo. As chaves são IDs de chats em grupo ou `"*"` para os padrões. Consulte [Chats em Grupo](#group-chats)                                                                     |
| `dispatchMode`           | Não              | O que acontece quando você envia uma mensagem enquanto o bot está ocupado: `steer` (padrão), `collect` ou `followup`. Consulte [Modos de Despacho](#dispatch-modes)                         |
| `blockStreaming`         | Não              | Entrega progressiva de respostas: `on` ou `off` (padrão). Consulte [Block Streaming](#block-streaming)                                                                        |
| `blockStreamingChunk`    | Não              | Limites de tamanho do chunk: `{ "minChars": 400, "maxChars": 1000 }`. Consulte [Block Streaming](#block-streaming)                                                                    |
| `blockStreamingCoalesce` | Não              | Flush por ociosidade: `{ "idleMs": 1500 }`. Consulte [Block Streaming](#block-streaming)                                                                                              |

### Política de Remetente

Controla quem pode interagir com o bot:

- **`allowlist`** (padrão) — Apenas os usuários listados em `allowedUsers` podem enviar mensagens. Os demais são ignorados silenciosamente.
- **`pairing`** — Remetentes desconhecidos recebem um código de pareamento. O operador do bot os aprova via CLI e eles são adicionados a uma allowlist persistente. Os usuários em `allowedUsers` pulam o pareamento completamente. Consulte [Pareamento de DM](#dm-pairing) abaixo.
- **`open`** — Qualquer pessoa pode enviar mensagens. Use com cautela.

### Escopo da Sessão

Controla como as sessões de conversa são gerenciadas:

- **`user`** (padrão) — Uma sessão por usuário. Todas as mensagens do mesmo usuário compartilham uma conversa.
- **`thread`** — Uma sessão por thread/tópico. Útil para chats em grupo com threads.
- **`single`** — Uma sessão compartilhada para todos os usuários. Todos compartilham a mesma conversa.

### Memória do Canal

A memória do canal permite que um membro autorizado do canal salve um contexto estável para um chat ou thread. O Qwen Code injeta essa memória quando uma nova sessão do canal é iniciada, inclusive após um `/clear`.

Exemplos em linguagem natural:

- `记住：默认使用 staging 环境` salva a memória para o chat ou thread atual.
- `你记一下以后回复前要说 1122` salva a memória durável extraída.
- `你现在都记住了什么` mostra a memória salva para o chat ou thread atual.
- `把这个聊天的记忆清空` inicia o fluxo de limpeza; `确认清空记忆` o confirma.

Chats em grupo podem mostrar a memória salva, mas escritas e limpezas são bloqueadas para evitar transformar a memória compartilhada em um caminho de injeção de prompt para outros participantes.

Apenas os usuários listados em `allowedUsers` podem ler, escrever ou limpar a memória do canal. Se `allowedUsers` estiver vazio, os comandos de memória do canal são desativados para todos.

### Segurança do Token

Os tokens do bot não devem ser armazenados diretamente no `settings.json`. Em vez disso, use referências a variáveis de ambiente:

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

Defina o token real no ambiente do seu shell ou em um arquivo `.env` que é carregado antes de executar o canal.

## Pareamento de DM

Quando `senderPolicy` é definido como `"pairing"`, remetentes desconhecidos passam por um fluxo de aprovação:

1. Um usuário desconhecido envia uma mensagem para o bot
2. O bot responde com um código de pareamento de 8 caracteres (por exemplo, `VEQDDWXJ`)
3. O usuário compartilha o código com você (o operador do bot)
4. Você o aprova via CLI:

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

Uma vez aprovado, o ID do usuário é salvo em `~/.qwen/channels/<name>-allowlist.json` e todas as mensagens futuras passam normalmente.

### Comandos CLI de Pareamento

```bash
# Lista solicitações de pareamento pendentes
qwen channel pairing list my-channel

# Aprova uma solicitação pelo código
qwen channel pairing approve my-channel <CODE>
```

### Regras de Pareamento

- Os códigos têm 8 caracteres, em maiúsculas, usando um alfabeto não ambíguo (sem `0`/`O`/`1`/`I`)
- Os códigos expiram após 1 hora
- Máximo de 3 solicitações pendentes por canal por vez — solicitações adicionais são ignoradas até que uma expire ou seja aprovada
- Os usuários listados em `allowedUsers` no `settings.json` sempre pulam o pareamento
- Os usuários aprovados são armazenados em `~/.qwen/channels/<name>-allowlist.json` — trate este arquivo como sensível

## Chats em Grupo

Por padrão, o bot funciona apenas em mensagens diretas. Para ativar o suporte a chats em grupo, defina `groupPolicy` como `"allowlist"` ou `"open"`.

### Política de Grupo

Controla se o bot participa de chats em grupo:

- **`disabled`** (padrão) — O bot ignora todas as mensagens de grupo. Opção mais segura.
- **`allowlist`** — O bot responde apenas em grupos listados explicitamente em `groups` pelo ID do chat. A chave `"*"` fornece configurações padrão, mas **não** atua como um curinga de permissão.
- **`open`** — O bot responde em todos os grupos aos quais é adicionado. Use com cautela.

### Filtragem por Menção

Em grupos, o bot exige uma `@mention` ou uma resposta a uma de suas mensagens por padrão. Isso evita que o bot responda a todas as mensagens em um chat em grupo.

Configure por grupo com a configuração `groups`:

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — Configurações padrão para todos os grupos. Apenas define os padrões de configuração, não é uma entrada de allowlist.
- **ID do chat em grupo** — Substitui as configurações para um grupo específico. Substitui os padrões de `"*"`.
- **`requireMention`** (padrão: `true`) — Quando `true`, o bot responde apenas a mensagens que o @mencionam ou respondem a uma de suas mensagens. Quando `false`, o bot responde a todas as mensagens (útil para grupos de tarefas dedicadas).

### Preenchimento Retroativo do Histórico do Grupo

Por padrão, o Qwen ignora mensagens de grupo não mencionadas e não as armazena como turnos de sessão. Para permitir que a próxima `@mention` inclua o contexto recente do grupo, defina `groupHistoryLimit` como um número positivo.

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "groupPolicy": "open",
      "groupHistoryLimit": 50,
      "groups": {
        "*": { "requireMention": true },
        "sensitive-group-id": {
          "requireMention": true,
          "groupHistoryLimit": 0
        }
      }
    }
  }
}
```

- Omitido ou `0` desativa o preenchimento retroativo.
- O `groupHistoryLimit` no nível do grupo substitui o valor no nível do canal.
- Apenas mensagens de remetentes autorizados são persistidas.
- Mensagens rejeitadas por `groupPolicy` ou pela allowlist do grupo não são persistidas.
- O histórico de grupo pendente é armazenado como JSONL local em `~/.qwen/channels/<channel-name>-group-history.jsonl` ou `$QWEN_HOME/channels/<channel-name>-group-history.jsonl`.
- As mensagens em cache são injetadas como contexto não confiável no próximo gatilho real e não são escritas como turnos de sessão independentes.

### Como as mensagens de grupo são avaliadas

```
1. groupPolicy — este grupo é permitido?           (não → ignorar)
2. requireMention — o bot foi mencionado/teve resposta? (não → ignorar)
3. senderPolicy — este remetente é aprovado?         (não → fluxo de pareamento)
4. Roteia para a sessão
```

### Configuração do Telegram para Grupos

1. Adicione o bot a um grupo
2. **Desative o modo de privacidade** no BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off) — caso contrário, o bot não verá mensagens que não sejam comandos
3. **Remova e readicione o bot** ao grupo após alterar o modo de privacidade (o Telegram armazena essa configuração em cache)
### Encontrando o ID do Chat de um Grupo

Para encontrar o ID do chat de um grupo para a allowlist `groups`:

1. Pare o bot se ele estiver em execução
2. Envie uma mensagem mencionando o bot no grupo
3. Use a Telegram Bot API para verificar as atualizações na fila:

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

Procure por `message.chat.id` na resposta — os IDs de grupo são números negativos (por exemplo, `-5170296765`).

## Suporte a Mídia

Os canais suportam o envio de imagens e arquivos para o agente, não apenas texto.

### Imagens

Envie uma foto para o bot e o agente a verá — útil para compartilhar capturas de tela, mensagens de erro ou diagramas. A imagem é enviada diretamente para o modelo como uma entrada visual.

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

Envie um documento (PDF, arquivo de código, arquivo de texto, etc.) para o bot. O arquivo é baixado e salvo em um diretório temporário, e o caminho do arquivo é informado ao agente para que ele possa ler o conteúdo usando suas ferramentas de leitura de arquivos.

Arquivos funcionam com qualquer modelo — não é necessário suporte multimodal.

### Diferenças entre plataformas

| Recurso  | Telegram                                     | WeChat                           | DingTalk                                      | Feishu                                                      |
| -------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| Imagens  | Download direto via Bot API                  | Download via CDN com descriptografia AES | API downloadCode (duas etapas)              | Endpoint de recursos da Open API (GET autenticado, limite de 50MB) |
| Arquivos | Download direto via Bot API (limite de 20MB) | Download via CDN com descriptografia AES | API downloadCode (duas etapas)              | Endpoint de recursos da Open API (limite de 50MB)           |
| Legendas | Legendas de foto/arquivo incluídas como texto da mensagem | Não se aplica                  | Rich text: texto + imagens misturados em uma mensagem | Rich text (`post`): texto extraído; imagens incorporadas ignoradas |

> O QQ Bot não processa mídias recebidas — mensagens de imagem e sticker são ignoradas, por isso não há uma linha de tratamento de mídia acima.

## Modos de Dispatch

Controla o que acontece quando você envia uma nova mensagem enquanto o bot ainda está processando uma anterior.

- **`steer`** (padrão) — O bot cancela a solicitação atual e começa a trabalhar na sua nova mensagem. Melhor para chats normais, onde um acompanhamento geralmente significa que você quer corrigir ou redirecionar o bot.
- **`collect`** — Suas novas mensagens são armazenadas em buffer. Quando a solicitação atual termina, todas as mensagens em buffer são combinadas em um único prompt de acompanhamento. Bom para fluxos de trabalho assíncronos onde você deseja enfileirar ideias.
- **`followup`** — Cada mensagem é enfileirada e processada como sua própria vez separada, em ordem. Útil para fluxos de trabalho em lote onde cada mensagem é independente.

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

Você também pode definir o modo de dispatch por grupo, substituindo o padrão do canal:

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## Block Streaming

Por padrão, o agente trabalha por um tempo e depois envia uma resposta grande. Com o block streaming ativado, a resposta chega como várias mensagens mais curtas enquanto o agente ainda está trabalhando — semelhante a como o ChatGPT ou o Claude mostram a saída progressiva.

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
- `minChars` (padrão 400) — não envia um bloco até que ele tenha pelo menos esse tamanho, para evitar spam de mensagens muito curtas
- `maxChars` (padrão 1000) — se um bloco atingir esse tamanho sem uma quebra natural, envia-o mesmo assim
- `idleMs` (padrão 1500) — se o agente pausar (por exemplo, ao executar uma ferramenta), envia o que está em buffer até o momento
- Quando o agente termina, qualquer texto restante é enviado imediatamente

Apenas `blockStreaming` é obrigatório. As configurações de chunk e coalesce são opcionais e possuem padrões sensatos.

## Comandos Slash

Os canais suportam comandos slash. Eles são tratados localmente (sem ida e volta ao agente):

- `/help` — Lista os comandos disponíveis
- `/clear` — Limpa sua sessão e começa do zero (aliases: `/reset`, `/new`)
- `/status` — Mostra informações da sessão e política de acesso

Todos os outros comandos slash (por exemplo, `/compress`, `/summary`) são encaminhados para o agente.

Esses comandos funcionam em todos os tipos de canal (Telegram, WeChat, QQ, DingTalk, Feishu).

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

O bot é executado em primeiro plano. Pressione `Ctrl+C` para parar ou use `qwen channel stop` em outro terminal.

### Modo Experimental Gerenciado por Daemon

Você também pode executar canais configurados sob o `qwen serve`:

```bash
# Start one channel under the daemon lifecycle
qwen serve --channel my-channel

# Start all configured channels
qwen serve --channel all
```

Este modo inicia um processo de worker de canal pertencente ao `qwen serve`. O worker se conecta de volta ao daemon através do SDK e usa os mesmos adaptadores de canal. Ele é separado do processo do daemon, portanto, uma falha no adaptador de canal não derruba o daemon.

`qwen serve --channel` não é o mesmo serviço que `qwen channel start`. O `qwen channel start` independente ainda usa o serviço de canal com suporte ACP e pode executar configurações de canal com valores de `cwd` diferentes. Os canais gerenciados pelo daemon exigem que o `cwd` de cada canal selecionado seja resolvido para o workspace do daemon.

Quando os canais são gerenciados pelo serve, `qwen channel status` mostra o proprietário como `qwen serve`, e `qwen channel stop` instrui você a parar o daemon em vez de sinalizar o worker diretamente. Se um worker pronto sair inesperadamente, o daemon continua em execução e relata um aviso de channel-worker em `/daemon/status`.

### Modo Multi-Canal

Quando você executa `qwen channel start` sem um nome, todos os canais definidos em `settings.json` iniciam juntos compartilhando um único processo de agente. Cada canal mantém suas próprias sessões — um usuário do Telegram e um usuário do WeChat têm conversas separadas, mesmo compartilhando o mesmo agente.

Cada canal usa seu próprio `cwd` a partir de sua configuração, então canais diferentes podem trabalhar em projetos diferentes simultaneamente.

### Gerenciamento de Serviço

O serviço de canal usa um arquivo PID (`~/.qwen/channels/service.pid`) para rastrear a instância em execução:

- **Prevenção de duplicação**: Executar `qwen channel start` enquanto um serviço já está em execução mostrará um erro em vez de iniciar uma segunda instância
- **`qwen channel stop`**: Para graciosamente o serviço em execução a partir de outro terminal
- **`qwen channel status`**: Mostra se o serviço está em execução, seu tempo de atividade e a contagem de sessões por canal

### Recuperação de Falhas

Se o processo do agente falhar inesperadamente, o serviço de canal o reinicia automaticamente e tenta restaurar todas as sessões ativas. Os usuários podem continuar suas conversas sem recomeçar.

- As sessões são persistidas em `~/.qwen/channels/sessions.json` enquanto o serviço está em execução
- Em caso de falha: o agente reinicia em até 3 segundos e recarrega as sessões salvas
- Após 3 falhas consecutivas, o serviço é encerrado com um erro
- No desligamento limpo (Ctrl+C ou `qwen channel stop`): os dados da sessão são limpos — a próxima inicialização é sempre do zero