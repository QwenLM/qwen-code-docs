# Canais

Canais permitem que você interaja com um agente Qwen Code a partir de plataformas de mensagens como Telegram, WeChat, QQ ou DingTalk, em vez do terminal. Você envia mensagens do seu aplicativo de chat no celular ou desktop, e o agente responde da mesma forma que faria no CLI.

## Como Funciona

Quando você executa `qwen channel start`, o Qwen Code:

1. Lê as configurações dos canais a partir do seu `settings.json`
2. Inicia um único processo do agente usando o [Agent Client Protocol (ACP)](../../../developers/architecture.md)
3. Conecta-se a cada plataforma de mensagens e começa a escutar por mensagens
4. Roteia mensagens recebidas para o agente e envia as respostas de volta ao chat correto

Todos os canais compartilham um único processo do agente com sessões isoladas por usuário. Cada canal pode ter seu próprio diretório de trabalho, modelo e instruções.

## Início Rápido

1. Configure um bot na sua plataforma de mensagens (consulte os guias específicos: [Telegram](./telegram), [WeChat](./weixin), [QQ Bot](./qqbot), [DingTalk](./dingtalk))
2. Adicione a configuração do canal ao `~/.qwen/settings.json`
3. Execute `qwen channel start` para iniciar todos os canais, ou `qwen channel start <nome>` para um único canal

Quer conectar uma plataforma que não vem integrada? Veja [Plugins](./plugins) para adicionar um adaptador personalizado como extensão.

## Configuração

Os canais são configurados na chave `channels` do `settings.json`. Cada canal tem um nome e um conjunto de opções:

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
      "instructions": "Instruções opcionais do sistema para o agente.",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### Opções

| Opção                   | Obrigatório | Descrição                                                                                                                                                |
| ----------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                  | Sim         | Tipo do canal: `telegram`, `weixin`, `qq`, `dingtalk`, `feishu` ou um tipo personalizado de uma extensão (veja [Plugins](./plugins))                      |
| `token`                 | Telegram    | Token do bot. Suporta a sintaxe `$ENV_VAR` para ler de variáveis de ambiente. Não necessário para WeChat ou DingTalk                                     |
| `clientId`              | DingTalk    | DingTalk AppKey. Suporta a sintaxe `$ENV_VAR`                                                                                                            |
| `clientSecret`          | DingTalk    | DingTalk AppSecret. Suporta a sintaxe `$ENV_VAR`                                                                                                         |
| `model`                 | Não         | Modelo a ser usado para este canal (ex.: `qwen3.5-plus`). Substitui o modelo padrão. Útil para modelos multimodais que suportam entrada de imagens       |
| `senderPolicy`          | Não         | Quem pode falar com o bot: `allowlist` (padrão), `open` ou `pairing`                                                                                     |
| `allowedUsers`          | Não         | Lista de IDs de usuários autorizados a usar o bot (usada pelas políticas `allowlist` e `pairing`)                                                        |
| `sessionScope`          | Não         | Como as sessões são definidas: `user` (padrão), `thread` ou `single`                                                                                     |
| `cwd`                   | Não         | Diretório de trabalho para o agente. Padrão: diretório atual                                                                                             |
| `instructions`          | Não         | Instruções personalizadas adicionadas antes da primeira mensagem de cada sessão                                                                           |
| `groupPolicy`           | Não         | Acesso a grupos: `disabled` (padrão), `allowlist` ou `open`. Veja [Grupos](#grupos)                                                                     |
| `groups`                | Não         | Configurações por grupo. As chaves são IDs de grupos ou `"*"` para padrões. Veja [Grupos](#grupos)                                                       |
| `dispatchMode`          | Não         | O que acontece quando você envia uma mensagem enquanto o bot está ocupado: `steer` (padrão), `collect` ou `followup`. Veja [Modos de Despacho](#modos-de-despacho) |
| `blockStreaming`        | Não         | Entrega progressiva de respostas: `on` ou `off` (padrão). Veja [Streaming em Blocos](#streaming-em-blocos)                                                |
| `blockStreamingChunk`   | Não         | Limites de tamanho de bloco: `{ "minChars": 400, "maxChars": 1000 }`. Veja [Streaming em Blocos](#streaming-em-blocos)                                    |
| `blockStreamingCoalesce`| Não         | Liberação por inatividade: `{ "idleMs": 1500 }`. Veja [Streaming em Blocos](#streaming-em-blocos)                                                        |

### Política de Remetente

Controla quem pode interagir com o bot:

- **`allowlist`** (padrão) — Apenas usuários listados em `allowedUsers` podem enviar mensagens. Outros são ignorados silenciosamente.
- **`pairing`** — Remetentes desconhecidos recebem um código de emparelhamento. O operador do bot os aprova via CLI e eles são adicionados a uma lista de permissões persistente. Usuários em `allowedUsers` pulam o emparelhamento completamente. Veja [Emparelhamento por DM](#emparelhamento-por-dm) abaixo.
- **`open`** — Qualquer um pode enviar mensagens. Use com cuidado.

### Escopo da Sessão

Controla como as sessões de conversa são gerenciadas:

- **`user`** (padrão) — Uma sessão por usuário. Todas as mensagens do mesmo usuário compartilham uma conversa.
- **`thread`** — Uma sessão por thread/tópico. Útil para chats em grupo com threads.
- **`single`** — Uma sessão compartilhada para todos os usuários. Todos compartilham a mesma conversa.

### Armazenamento Seguro de Tokens

Tokens de bot não devem ser armazenados diretamente no `settings.json`. Em vez disso, use referências a variáveis de ambiente:

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

Defina o token real no seu ambiente de shell ou em um arquivo `.env` que seja carregado antes de executar o canal.

## Emparelhamento por DM

Quando `senderPolicy` está definido como `"pairing"`, remetentes desconhecidos passam por um fluxo de aprovação:

1. Um usuário desconhecido envia uma mensagem para o bot
2. O bot responde com um código de emparelhamento de 8 caracteres (ex.: `VEQDDWXJ`)
3. O usuário compartilha o código com você (o operador do bot)
4. Você aprova via CLI:

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

Uma vez aprovado, o ID do usuário é salvo em `~/.qwen/channels/<nome>-allowlist.json` e todas as mensagens futuras passam normalmente.

### Comandos de CLI para Emparelhamento

```bash
# Listar solicitações de emparelhamento pendentes
qwen channel pairing list my-channel

# Aprovar uma solicitação pelo código
qwen channel pairing approve my-channel <CODE>
```

### Regras de Emparelhamento

- Códigos têm 8 caracteres, maiúsculos, usando um alfabeto sem ambiguidade (sem `0`/`O`/`1`/`I`)
- Códigos expiram após 1 hora
- Máximo de 3 solicitações pendentes por canal por vez — solicitações adicionais são ignoradas até que uma expire ou seja aprovada
- Usuários listados em `allowedUsers` no `settings.json` sempre pulam o emparelhamento
- Usuários aprovados são armazenados em `~/.qwen/channels/<nome>-allowlist.json` — trate este arquivo como sensível

## Grupos

Por padrão, o bot funciona apenas em mensagens diretas. Para habilitar o suporte a grupos, defina `groupPolicy` como `"allowlist"` ou `"open"`.

### Política de Grupos

Controla se o bot participa de chats em grupo:

- **`disabled`** (padrão) — O bot ignora todas as mensagens de grupo. Opção mais segura.
- **`allowlist`** — O bot responde apenas em grupos explicitamente listados em `groups` pelo ID do chat. A chave `"*"` fornece configurações padrão, mas **não** atua como uma permissão curinga.
- **`open`** — O bot responde em todos os grupos em que foi adicionado. Use com cuidado.

### Filtro de Menção

Em grupos, o bot exige uma `@menção` ou uma resposta a uma de suas mensagens por padrão. Isso evita que o bot responda a todas as mensagens em um chat em grupo.

Configure por grupo com a opção `groups`:

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — Configurações padrão para todos os grupos. Apenas define padrões de configuração, não uma entrada na lista de permissões.
- **ID do chat em grupo** — Substitui as configurações para um grupo específico. Substitui os padrões de `"*"`.
- **`requireMention`** (padrão: `true`) — Quando `true`, o bot só responde a mensagens que o mencionam com @ ou respondem a uma de suas mensagens. Quando `false`, o bot responde a todas as mensagens (útil para grupos de tarefas dedicados).

### Como as mensagens em grupo são avaliadas

```
1. groupPolicy — este grupo é permitido?           (não → ignorar)
2. requireMention — o bot foi mencionado/respondeu? (não → ignorar)
3. senderPolicy — este remetente está aprovado?     (não → fluxo de emparelhamento)
4. Rotear para a sessão
```

### Configuração do Telegram para Grupos

1. Adicione o bot a um grupo
2. **Desative o modo de privacidade** no BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off) — caso contrário, o bot não verá mensagens que não sejam comandos
3. **Remova e adicione o bot novamente** ao grupo após alterar o modo de privacidade (o Telegram armazena essa configuração em cache)

### Encontrando o ID de um Chat em Grupo

Para encontrar o ID de um grupo para a lista de permissões `groups`:

1. Pare o bot se ele estiver em execução
2. Envie uma mensagem mencionando o bot no grupo
3. Use a API do Telegram Bot para verificar as atualizações na fila:

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

Procure por `message.chat.id` na resposta — IDs de grupo são números negativos (ex.: `-5170296765`).

## Suporte a Mídia

Os canais suportam o envio de imagens e arquivos para o agente, não apenas texto.

### Imagens

Envie uma foto para o bot e o agente a verá — útil para compartilhar prints de tela, mensagens de erro ou diagramas. A imagem é enviada diretamente ao modelo como entrada visual.

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

Envie um documento (PDF, arquivo de código, arquivo de texto, etc.) para o bot. O arquivo é baixado e salvo em um diretório temporário, e o agente recebe o caminho do arquivo para que possa ler o conteúdo usando suas ferramentas de leitura.

Arquivos funcionam com qualquer modelo — não é necessário suporte multimodal.

### Diferenças entre plataformas

| Funcionalidade | Telegram                                     | WeChat                           | DingTalk                                      |
| -------------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| Imagens        | Download direto via API do Bot               | Download por CDN com descriptografia AES | API downloadCode (duas etapas)                |
| Arquivos       | Download direto via API do Bot (limite 20MB) | Download por CDN com descriptografia AES | API downloadCode (duas etapas)                |
| Legendas       | Legendas de fotos/arquivos incluídas como texto da mensagem | Não aplicável                    | Texto rico: texto + imagens misturados em uma mensagem |

## Modos de Despacho

Controla o que acontece quando você envia uma nova mensagem enquanto o bot ainda está processando uma anterior.

- **`steer`** (padrão) — O bot cancela a requisição atual e começa a trabalhar na sua nova mensagem. Melhor para chat normal, onde uma continuação geralmente significa que você quer corrigir ou redirecionar o bot.
- **`collect`** — Suas novas mensagens são colocadas em buffer. Quando a requisição atual termina, todas as mensagens em buffer são combinadas em um único prompt de continuação. Bom para fluxos de trabalho assíncronos onde você quer enfileirar pensamentos.
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

Por padrão, o agente trabalha por um tempo e depois envia uma única resposta grande. Com o streaming em blocos ativado, a resposta chega como várias mensagens mais curtas enquanto o agente ainda está trabalhando — semelhante a como o ChatGPT ou Claude mostram saída progressiva.

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

- a resposta do agente é dividida em blocos nos limites de parágrafos e enviada como mensagens separadas
- `minChars` (padrão 400) — não enviar um bloco antes que ele tenha pelo menos este tamanho, para evitar enviar mensagens muito pequenas
- `maxChars` (padrão 1000) — se um bloco ficar com este tamanho sem uma quebra natural, enviá-lo mesmo assim
- `idleMs` (padrão 1500) — se o agente pausar (ex.: executando uma ferramenta), enviar o que está no buffer até o momento
- Quando o agente termina, qualquer texto restante é enviado imediatamente

Apenas `blockStreaming` é obrigatório. As configurações de chunk e coalesce são opcionais e possuem padrões sensatos.

## Comandos de Barra

Os canais suportam comandos de barra. Eles são tratados localmente (sem ida e volta ao agente):

- `/help` — Lista os comandos disponíveis
- `/clear` — Limpa sua sessão e começa do zero (aliases: `/reset`, `/new`)
- `/status` — Mostra informações da sessão e política de acesso

Todos os outros comandos de barra (ex.: `/compress`, `/summary`) são encaminhados ao agente.

Esses comandos funcionam em todos os tipos de canal (Telegram, WeChat, QQ, DingTalk).

## Execução

```bash
# Inicia todos os canais configurados (processo do agente compartilhado)
qwen channel start

# Inicia um único canal
qwen channel start my-channel

# Verifica se o serviço está em execução
qwen channel status

# Para o serviço em execução
qwen channel stop
```

O bot é executado em primeiro plano. Pressione `Ctrl+C` para parar, ou use `qwen channel stop` de outro terminal.

### Modo Multicanal

Quando você executa `qwen channel start` sem um nome, todos os canais definidos no `settings.json` são iniciados juntos, compartilhando um único processo do agente. Cada canal mantém suas próprias sessões — um usuário do Telegram e um usuário do WeChat têm conversas separadas, mesmo compartilhando o mesmo agente.

Cada canal usa seu próprio `cwd` da sua configuração, então canais diferentes podem trabalhar em projetos diferentes simultaneamente.

### Gerenciamento de Serviço

O serviço de canais usa um arquivo PID (`~/.qwen/channels/service.pid`) para rastrear a instância em execução:

- **Prevenção de duplicidade**: Executar `qwen channel start` enquanto um serviço já está rodando mostrará um erro em vez de iniciar uma segunda instância
- **`qwen channel stop`**: Para o serviço em execução graciosamente a partir de outro terminal
- **`qwen channel status`**: Mostra se o serviço está em execução, seu tempo de atividade e contagens de sessões por canal

### Recuperação de Falhas

Se o processo do agente falhar inesperadamente, o serviço de canais o reinicia automaticamente e tenta restaurar todas as sessões ativas. Os usuários podem continuar suas conversas sem precisar recomeçar.

- As sessões são persistidas em `~/.qwen/channels/sessions.json` enquanto o serviço está em execução
- Em caso de falha: o agente reinicia em até 3 segundos e recarrega as sessões salvas
- Após 3 falhas consecutivas, o serviço é encerrado com um erro
- Em encerramento limpo (Ctrl+C ou `qwen channel stop`): os dados da sessão são limpos — a próxima inicialização é sempre nova