# Canais

Os canais permitem que você interaja com um agente do Qwen Code a partir de plataformas de mensagens como Telegram, WeChat, QQ, DingTalk, WeCom ou Feishu, em vez do terminal. Você envia mensagens do seu celular ou aplicativo de chat no desktop, e o agente responde exatamente como faria na CLI.

Plataformas de hospedagem de código (começando com [GitHub](./github)) e contas autenticadas de workspace (começando com [DingTalk Workspace](./dws)) também são suportadas via canais.

## Como Funciona

Ao executar `qwen channel start`, o Qwen Code:

1. Lê as configurações de canais do seu `settings.json`
2. Inicia um único processo de agente usando o [Agent Client Protocol (ACP)](../../../developers/architecture.md)
3. Conecta-se a cada plataforma de mensagens e começa a ouvir as mensagens
4. Roteia as mensagens recebidas para o agente e envia as respostas de volta para o chat correto

Todos os canais compartilham um único processo de agente com sessões isoladas por usuário. Cada canal pode ter seu próprio diretório de trabalho, modelo e instruções.

## Início Rápido

1. Configure um bot ou uma conta autenticada de workspace (consulte os guias específicos de cada canal: [Telegram](./telegram), [WeChat](./weixin), [QQ Bot](./qqbot), [DingTalk](./dingtalk), [DingTalk Workspace](./dws), [WeCom](./wecom), [Feishu](./feishu), [GitHub](./github))
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
      "dmPolicy": "open",
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
| `type`                   | Sim              | Tipo de canal: `telegram`, `weixin`, `qq`, `dingtalk`, `dws`, `wecom`, `feishu`, `github`, `gitlab` ou um tipo personalizado de uma extensão (consulte [Plugins](./plugins)) |
| `token`                  | Telegram         | Token do bot. Suporta a sintaxe `$ENV_VAR` para ler de variáveis de ambiente. Não é necessário para WeChat, DingTalk, WeCom ou Feishu                                            |
| `clientId`               | DingTalk, Feishu | AppKey do DingTalk ou App ID do Feishu. Suporta a sintaxe `$ENV_VAR`                                                                                                           |
| `clientSecret`           | DingTalk, Feishu | AppSecret do DingTalk ou App Secret do Feishu. Suporta a sintaxe `$ENV_VAR`                                                                                                    |
| `botId`                  | WeCom            | Bot ID do robô inteligente do WeCom. Suporta a sintaxe `$ENV_VAR`. Consulte [WeCom](./wecom)                                                                                       |
| `secret`                 | WeCom            | Secret do robô inteligente do WeCom. Suporta a sintaxe `$ENV_VAR`. Consulte [WeCom](./wecom)                                                                                       |
| `model`                  | Não              | Modelo a ser usado para este canal (por exemplo, `qwen3.5-plus`). Substitui o modelo padrão. Útil para modelos multimodais que suportam entrada de imagens                               |
| `senderPolicy`           | Não              | Quem pode falar com o bot: `allowlist` (padrão), `open` ou `pairing`                                                                                                   |
| `allowedUsers`           | Não              | Lista de IDs de usuários autorizados a usar o bot (usado pelas políticas `allowlist` e `pairing`)                                                                                   |
| `sessionScope`           | Não              | Como as sessões são delimitadas: `user` (padrão), `chat_thread` ou `single`. O `thread` legado permanece compatível quando já configurado, mas não é oferecido para novas configurações do Web Shell |
| `cwd`                    | Não              | Diretório de trabalho para o agente. O padrão é o diretório atual                                                                                                     |
| `approvalMode`           | Não              | Modo de aprovação de ferramentas para sessões de canal. Tarefas não supervisionadas via webhook exigem `yolo`; a configuração se aplica a todas as sessões do canal                                  |
| `instructions`           | Não              | Instruções personalizadas adicionadas no início da primeira mensagem de cada sessão                                                                                                     |
| `webhooks`               | Não              | Fontes de webhook e destinos de entrega para canais gerenciados pelo daemon. Consulte [Tarefas disparadas por webhook](#webhook-triggered-tasks)                                              |
| `groupPolicy`            | Não              | Acesso a chats em grupo: `disabled` (padrão), `allowlist`, `pairing` ou `open`. Consulte [Chats em Grupo](#group-chats)                                                                       |
| `dmPolicy`               | Não              | Acesso a DMs privadas: `open` (padrão) ou `disabled` (descarta todas as DMs silenciosamente). Útil para bots apenas em grupo                                                                  |
| `groupHistoryLimit`      | Não              | Preenchimento retroativo opt-in do histórico do grupo. `0` ou omitido desativa. Um número positivo persiste essa quantidade de mensagens de grupo não mencionadas de remetentes autorizados ou membros de grupos pareados aprovados para a próxima menção/resposta do bot. |
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
- **`chat_thread`** — Uma sessão por thread/tópico de chat, compartilhada pelos participantes dessa thread.
- **`thread`** — Roteamento legado de thread/tópico mantido para configurações existentes.
- **`single`** — Uma sessão compartilhada para todos os usuários. Todos compartilham a mesma conversa.

### Tarefas Nomeadas

Canais gerenciados pelo daemon podem reter várias conversas nomeadas para o mesmo usuário em um chat:

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "sessionScope": "user",
      "multiSession": true
    }
  }
}
```

O catálogo é privado para o canal, chat e remetente exatos. Os nomes das tarefas usam 1–32 letras ASCII, números, underscores ou hifens, e são únicos sem distinção entre maiúsculas e minúsculas. Até oito tarefas podem estar abertas; fechar uma tarefa a desanexa sem excluir sua transcrição, então selecioná-la posteriormente reabre a conversa exata. IDs de sessão nunca são aceitos nem mostrados em comandos de chat.

A Parte 2 usa uma tarefa selecionada por vez e um diretório de trabalho compartilhado. Criar uma tarefa ou mudar da tarefa selecionada é rejeitado enquanto essa tarefa ainda estiver em execução ou aguardando permissão, e uma tarefa ocupada não pode ser fechada. Troca concorrente de tarefas em execução, cancelamento nomeado e rótulos de tarefas estão planejados para a Parte 3; worktrees por tarefa estão planejados para a Parte 4. A memória do canal permanece com escopo do chat, não de uma tarefa nomeada.

Este modo não está disponível no `qwen channel start` standalone, com webhooks, com `groupHistoryLimit` diferente de zero no canal ou no grupo, ou com loops de Canal. Se um loop ativo já existir para esse canal, o worker do daemon se recusa a iniciar até que o loop seja desativado.

### Memória do Canal

A memória do canal armazena contexto durável para um chat ou thread. As entradas têm IDs estáveis, então uma resposta de listagem pode ser usada para operações de acompanhamento determinísticas.

- `记住：默认使用 staging 环境` é a forma determinística e salva exatamente uma entrada escalar para o chat ou thread atual.
- Para salvar vários fatos separados em uma requisição, use uma frase natural roteada pelo classificador. Por exemplo: `请记住这三条约定：使用 staging；发布前测试；优先中文回复` cria entradas que você pode gerenciar independentemente. Fatos duplicados exatos são ignorados e reportados sem criar outra entrada. Requisições contendo texto semelhante a credenciais são rejeitadas; remova os secrets e salve os fatos não sensíveis separadamente.
- `查看记忆` lista as entradas e seus IDs estáveis. Use `查看第 2 页记忆` para ver uma página posterior, `查看记忆 <id>` para ver uma entrada, ou uma requisição filtrada natural como `只看中文偏好` para listar as entradas correspondentes.
- `查看刚才那条记忆`, `把关于 staging 的记忆改成默认使用 production` e `忘掉刚才那条` funcionam quando a referência natural resolve para exatamente uma entrada. Atualizações e remoções naturais primeiro mostram a alteração proposta. Confirme uma atualização com `确认更新记忆` ou `confirm memory update`, ou uma remoção com `确认删除记忆` ou `confirm memory removal`, dentro de 60 segundos. Atualizações e remoções por ID exato permanecem imediatas e não precisam de confirmação.
- `清空记忆` inicia o fluxo de confirmação de limpeza total; `确认清空记忆` o conclui.

Quando uma requisição natural de inspeção, atualização ou remoção corresponde a múltiplas entradas, o bot retorna os IDs candidatos e as pré-visualizações sem alterar a memória. Não há seleção pendente para um resultado ambíguo: refaça a requisição com um ID exato, como `忘掉 m-a31f0d82c7e4`. Operações por ID exato permanecem sendo o caminho rápido determinístico. Uma requisição natural sem correspondência reporta que nenhuma entrada foi encontrada.

Confirmações pendentes de atualização, remoção e limpeza aplicam-se apenas ao remetente e ao chat ou thread que os criou. Uma nova proposta de limpeza, atualização natural ou remoção natural substitui uma anterior pendente para esse remetente e destino. Confirmações pendentes são descartadas quando o processo do canal reinicia.

Os aliases slash legados `/remember-channel`, `/channel-memory` e `/forget-channel` foram removidos. Eles não são mais comandos de memória do canal.

A memória do canal segue os portões de acesso do canal. Qualquer mensagem aceita por `senderPolicy`, `dmPolicy`, `groupPolicy`, configurações de grupo, pareamento e requisitos de menção pode ler, escrever, atualizar ou limpar a memória daquele chat ou thread. Membros aceitos do mesmo grupo compartilham o armazenamento alvo daquele grupo. Use políticas `allowlist` ou `pairing` quando a memória do grupo deve ser limitada a remetentes confiáveis.

A memória legada `CHANNEL.md` é migrada automaticamente para o armazenamento estruturado `CHANNEL.json` na primeira mutação. A memória estruturada persiste entre reinícios de canal standalone e canal gerenciado pelo daemon, e é injetada quando uma nova sessão com escopo de destino é iniciada, inclusive após `/clear`.

Após essa injeção inicial, cada mensagem aceita também recorda até três entradas relevantes para aquela mensagem. Isso mantém fatos duráveis disponíveis durante uma sessão de longa duração sem adicionar todas as entradas armazenadas a cada turno. A recordação é baseada na mensagem atual e não modifica a memória armazenada.

A memória permanece vinculada ao chat ou thread atual. Ela não é injetada nem recordada em uma sessão `sessionScope: single`, porque essa sessão é compartilhada em todo o canal em vez de ter escopo para um destino.

A memória do canal não aprende fatos automaticamente da conversa normal nem aceita `第一个` como confirmação para uma referência natural ambígua. Use uma requisição clara de lembrança e um ID exato de entrada quando uma referência natural for ambígua.

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

Uma vez aprovado, o ID do usuário é salvo na allowlist com escopo de workspace do canal (`~/.qwen/channels/<workspace-scope>/<name>-allowlist.json`) e todas as mensagens futuras passam normalmente. O estado de pareamento tem escopo por workspace, então dois workspaces usando o mesmo nome de canal mantêm aprovações separadas.

### Comandos CLI de Pareamento

```bash
# Lista solicitações de pareamento pendentes
qwen channel pairing list my-channel

# Aprova uma solicitação pelo código
qwen channel pairing approve my-channel <CODE>
```

Execute esses comandos a partir do diretório de workspace do canal (ou passe `--cwd <dir>`) — o estado de pareamento é armazenado por workspace.

### Regras de Pareamento

- Os códigos têm 8 caracteres, em maiúsculas, usando um alfabeto não ambíguo (sem `0`/`O`/`1`/`I`)
- Os códigos expiram após 1 hora
- Máximo de 3 solicitações pendentes por canal por vez, e no máximo uma por remetente — solicitações adicionais são recusadas até que uma expire ou seja aprovada
- Os usuários listados em `allowedUsers` no `settings.json` pulam o pareamento de usuário; sob `groupPolicy: "pairing"`, o grupo em si ainda precisa ser aprovado
- Os usuários aprovados são armazenados por workspace em `~/.qwen/channels/<workspace-scope>/<name>-allowlist.json` — trate este arquivo como sensível

## Chats em Grupo

Por padrão, o bot funciona apenas em mensagens diretas. Para ativar o suporte a chats em grupo, defina `groupPolicy` como `"allowlist"`, `"pairing"` ou `"open"`.

### Política de Grupo

Controla se o bot participa de chats em grupo:

- **`disabled`** (padrão) — O bot ignora todas as mensagens de grupo. Opção mais segura.
- **`allowlist`** — O bot responde apenas em grupos listados explicitamente em `groups` pelo ID do chat. A chave `"*"` fornece configurações padrão, mas **não** atua como um curinga de permissão.
- **`pairing`** — Uma menção deliberada ou resposta de um grupo desconhecido cria uma solicitação de pareamento para o grupo. Uma vez aprovado, todo membro pode usar o bot naquele grupo; `senderPolicy` continua a controlar mensagens diretas.
- **`open`** — O bot responde em todos os grupos aos quais é adicionado. Use com cautela.

Aprove um grupo com o mesmo comando CLI usado para pareamento de usuário. A solicitação pendente identifica o grupo e o membro que a iniciou:

```bash
qwen channel pairing approve my-channel <CODE>
```

As aprovações de grupo são armazenadas pelo chat ID do grupo no escopo de workspace do canal. No GitHub e GitLab, o chat ID é o caminho do repositório/projeto, então uma renomeação ou transferência desvincula a aprovação armazenada — reaprove o grupo após renomear. Um repositório ou projeto recriado sob o mesmo caminho herda qualquer aprovação obsoleta — revogue aprovações de grupo após qualquer renomeação, transferência ou exclusão.
Uma mensagem não mencionada nunca cria uma solicitação de pareamento de grupo, mesmo quando um grupo define `requireMention` como `false`; após a aprovação, a política de menção configurada se aplica normalmente.

Solicitações de pareamento de grupo compartilham a mesma fila pendente que solicitações de pareamento de DM: um canal holds no máximo 3 solicitações pendentes no total, e um remetente holds no máximo uma solicitação pendente entre solicitações de usuário e grupo (consulte [Regras de Pareamento](#pairing-rules)).

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
- Apenas mensagens de remetentes autorizados ou membros de um grupo pareado aprovado são persistidas.
- Mensagens rejeitadas por `groupPolicy` ou pela allowlist do grupo não são persistidas.
- O histórico de grupo pendente é armazenado como JSONL local em `~/.qwen/channels/<channel-name>-group-history.jsonl` ou `$QWEN_HOME/channels/<channel-name>-group-history.jsonl`.
- As mensagens em cache são injetadas como contexto não confiável no próximo gatilho real e não são escritas como turnos de sessão independentes.

### Como as mensagens de grupo são avaliadas

```
1. groupPolicy — este grupo está desativado, listado, pareado ou aberto? (não → ignorar/fluxo de pareamento)
2. dmPolicy — esta DM é permitida?                      (disabled → ignorar)
3. requireMention — o bot foi mencionado/teve resposta? (não → ignorar)
4. senderPolicy — este remetente é aprovado?             (ignorado para um grupo pareado; caso contrário, não → fluxo de pareamento de usuário)
5. Roteia para a sessão
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
>
> O WeCom aceita texto, imagens, texto misto com imagens, arquivos, vídeos e mensagens de voz (transcritas). Imagens são passadas ao agente como anexos; arquivos e vídeos são baixados para caminhos locais temporários. Consulte [WeCom](./wecom#images-and-files) para detalhes.

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

## Loops de Canal Agendados

Os canais possuem um agendador persistente para prompts que devem ser executados posteriormente e entregar seu resultado de volta ao mesmo chat. Você pode pedir ao agente de forma natural, por exemplo, `Every 15 minutes, check the deployment and report any change`, ou usar os comandos locais diretamente:

```text
/loop add "*/15 * * * *" check the deployment and report any change
/loop list
/loop inspect <id>
/loop cancel <id>
```

O agente usa as ferramentas `channel_loop_create`, `channel_loop_list` e `channel_loop_cancel` quando gerencia esses jobs para você. Agendamentos usam expressões cron padrão de cinco campos no horário local da máquina. O job é executado de forma não supervisionada e sua resposta final é entregue automaticamente ao chat que o criou.

Os loops de canal diferem das tarefas com escopo de sessão descritas em [Executar Prompts em um Agendamento](../scheduled-tasks):

- Eles são armazenados em `$QWEN_HOME/channels/` — canais standalone usam `cron.json` diretamente, enquanto canais gerenciados pelo daemon usam um arquivo por workspace em `daemon/`. Ambos sobrevivem a reinícios do canal.
- Eles têm escopo para o chat ou thread atual do canal. Cada destino pode ter até 10 loops ativos, e cada prompt é limitado a 4.000 caracteres.
- Eles requerem um adaptador e destino que suportem entrega proativa. Telegram, DingTalk, Feishu e WeCom optam por isso, sujeito a restrições de destino específicas da plataforma.
- Eles não estão disponíveis com `sessionScope: "single"` porque esse escopo não está vinculado a um destino de chat.
- Um loop salvo é desativado se seu destino não estiver mais autorizado quando for executado.

## Resultados de Agentes em Background

Quando o agente delega trabalho para um subagente ou fork em background, o resultado da conclusão é entregue de volta ao chat do canal que possui a sessão. A entrega pode acontecer após o término do turno original, então mantenha o serviço de canal ou o daemon em execução enquanto o trabalho em background estiver ativo.

## Comandos Slash

Os canais suportam comandos slash. Eles são tratados localmente (sem ida e volta ao agente):

- `/help` — Lista os comandos disponíveis
- `/clear` — Limpa sua sessão e começa do zero (aliases: `/reset`, `/new`)
- `/status` — Mostra informações da sessão e política de acesso
- `/sessions [all]` — Lista tarefas nomeadas abertas, ou inclui tarefas fechadas; disponível apenas com `multiSession: true`
- `/session current` — Mostra a tarefa nomeada selecionada
- `/session new <name>` — Cria e seleciona uma tarefa com workspace compartilhado
- `/session new <name> --worktree` — Reconhecido, mas adiado para a Parte 4
- `/session use <name>` — Seleciona uma tarefa aberta ou reabre uma tarefa fechada
- `/session cancel [<name>]` — Reconhecido, mas adiado para a Parte 3. Aguarde a tarefa selecionada terminar antes de trocar; usuários do Telegram podem usar `/cancel` para a tarefa selecionada
- `/session close <name>` — Fecha uma tarefa sem excluir sua transcrição
- `/loop add "<cron>" <prompt>` — Cria um loop de canal agendado persistente
- `/loop list` — Lista os loops do chat atual
- `/loop inspect <id>` — Mostra o status do loop e detalhes de execução
- `/loop cancel <id>` — Desativa um loop

Todos os outros comandos slash (por exemplo, `/compress`, `/summary`) são encaminhados para o agente. Os comandos de tarefas nomeadas são registrados apenas quando o modo está ativado, então `/sessions` permanece visível ao agente para configurações existentes.

Os comandos de tarefas nomeadas funcionam em todos os tipos de canal (Telegram, WeChat, QQ, DingTalk, WeCom, Feishu, GitHub). `/cancel` está registrado atualmente apenas pelo Telegram, e a criação de loops requer suporte a entrega proativa para o adaptador e destino atuais.

## Executando

```bash
# Inicia todos os canais configurados (processo de agente compartilhado)
qwen channel start

# Inicia um único canal
qwen channel start my-channel

# Verifica se o serviço está em execução
qwen channel status

# Para o serviço em execução
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

# Or enable channels later on a token-protected daemon
QWEN_SERVER_TOKEN=secret qwen serve
qwen channel set my-channel --token secret

# Query or stop the daemon-managed selection
qwen channel status --daemon-url http://127.0.0.1:4170 --token secret
qwen channel stop --daemon-url http://127.0.0.1:4170 --token secret
```

Este modo inicia processos de worker de canal agrupados por workspace pertencentes ao `qwen serve`. Os workers se conectam de volta ao daemon através do SDK e usam os mesmos adaptadores de canal. Eles são separados do processo do daemon, portanto, uma falha no adaptador de canal não derruba o daemon. Um daemon iniciado sem `--channel` não carrega adaptadores de canal nem reserva a concessão de PID do serviço de canal até o primeiro `qwen channel set`.

`qwen serve --channel` não é o mesmo serviço que `qwen channel start`. O `qwen channel start` independente ainda usa o serviço de canal com suporte ACP e pode executar configurações de canal com valores de `cwd` diferentes. Os canais gerenciados pelo daemon exigem que o `cwd` de cada canal selecionado seja resolvido para um workspace registrado pelo daemon. No modo multi-workspace, uma substituição de seleção mantém os workers para workspaces cuja lista ordenada de canais não mudou; `all` permanece apenas no workspace primário.

Sem `--daemon-url`, `qwen channel status` e `qwen channel stop` mantêm o comportamento de pidfile standalone. Suas variantes com `--daemon-url` consultam ou param o gerenciador do daemon. Seleções de runtime não são escritas nas configurações e não sobrevivem a reinícios do daemon. Se um worker pronto sair inesperadamente, o daemon continua em execução e relata um aviso de channel-worker em `/daemon/status`.

## Tarefas disparadas por webhook

Canais gerenciados pelo daemon também podem aceitar eventos de webhook autenticados. O Qwen recebe o evento como contexto, resume e decide o que é relevante, e então entrega a resposta final ao destino de chat configurado. Isso não é um retransmissor de notificações bruto.
Tarefas por webhook requerem `approvalMode: "yolo"` porque são executadas sem aprovação interativa. Essa configuração se aplica a todo o canal, não apenas aos turnos de webhook, então use um canal dedicado para webhook ou restrinja fortemente os remetentes de chat normal para esse canal.

Exemplo de configuração de canal:

```json
{
  "channels": {
    "dingtalk-main": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "cwd": "/repo",
      "senderPolicy": "allowlist",
      "allowedUsers": ["12345"],
      "approvalMode": "yolo",
      "sessionScope": "user",
      "webhooks": {
        "sources": {
          "github-ci": {
            "secretEnv": "QWEN_CHANNEL_GITHUB_CI_SECRET",
            "targets": {
              "operator": {
                "chatId": "DINGTALK_USER_ID",
                "senderId": "webhook:github-ci",
                "isGroup": false
              },
              "team": {
                "chatId": "OPEN_CONVERSATION_ID",
                "senderId": "webhook:github-ci",
                "isGroup": true
              }
            }
          }
        }
      }
    }
  }
}
```

Para DingTalk, defina `isGroup` explicitamente em cada destino. Um destino de mensagem direta usa o ID de usuário do DingTalk como `chatId` com `isGroup: false`; um destino de grupo usa o `openConversationId` do grupo com `isGroup: true`. Outros adaptadores podem exigir seu próprio formato de destino proativo.

Canais DingTalk, Feishu, Telegram e WeCom gerenciados pelo daemon observam dinamicamente contatos de mensagens recebidas autorizadas. Liste os contatos observados no workspace primário durante a janela de frescor padrão de sete dias:

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/workspace/channel/observed-contacts
```

Use `GET /workspaces/:workspace/channel/observed-contacts` para selecionar outro workspace registrado e confiável. Adicione `?freshWithinSeconds=N` para escolher uma janela de um segundo a 365 dias. O daemon anuncia essa API com a capability `workspace_channel_observed_contacts`.

A resposta retorna IDs completos de plataforma e rótulos. Rótulos de grupo usam nomes já presentes em mensagens recebidas aceitas quando disponíveis: DingTalk fornece `conversationTitle` e Telegram fornece `chat.title`. Rótulos de grupo do Feishu e WeCom atualmente fazem fallback para seus IDs completos; nenhuma API de diretório de plataforma ou detalhes de grupo é consultada. Rótulos de tópico também fazem fallback para IDs completos. Cada `lastObservedAt` é um timestamp canônico ISO 8601 UTC com precisão de milissegundos; os clientes podem convertê-lo para o fuso horário local do usuário para exibição. O `users` de nível superior contém usuários observados em mensagens diretas. `groups` contém conversas de grupo observadas, `groups[].users` contém usuários observados em cada grupo, e `groups[].topics[].users` contém usuários observados em tópicos do Feishu ou Telegram:

```json
{
  "users": [
    {
      "channelName": "feishu-main",
      "label": "Example User",
      "id": "ou_complete_user_id",
      "lastObservedAt": "2026-07-17T08:00:00.000Z"
    }
  ],
  "groups": [
    {
      "channelName": "feishu-main",
      "label": "oc_complete_chat_id",
      "id": "oc_complete_chat_id",
      "lastObservedAt": "2026-07-17T08:05:00.000Z",
      "users": [
        {
          "label": "Example User",
          "id": "ou_complete_user_id",
          "lastObservedAt": "2026-07-17T08:05:00.000Z"
        }
      ],
      "topics": []
    }
  ]
}
```

Esses usuários aninhados são participantes observados, não membros autoritativos do grupo. Apenas mensagens que passam pelos portões de direto/grupo, menção, remetente e pareamento são registradas. Observações repetidas atualizam rótulos e timestamps; observação passiva não pode detectar uma saída ou exclusão até que o relacionamento se torne obsoleto. Conteúdo de mensagem nunca é armazenado. O registro limitado fica em `$QWEN_HOME/channels/daemon/<workspaceHash>/observed-contacts.json`, fora do checkout do workspace e particionado por workspace. Seu limite de 500 observações é compartilhado por todos os canais e conversas naquele workspace, e observações com mais de 365 dias são removidas na próxima escrita aceita. Se o registro ficar corrompido ou usar uma versão não suportada, exclua esse arquivo para resetá-lo; tráfego aceito o recria. Configuração de webhook e entrega não são alterados.

Inicie o `qwen serve` com o worker de canal habilitado:

```bash
QWEN_SERVER_TOKEN="$QWEN_SERVER_TOKEN" qwen serve --require-auth --channel dingtalk-main
```

Exemplo de requisição:

```bash
curl -X POST "http://127.0.0.1:4170/channels/dingtalk-main/webhooks/github-ci" \
  -H "x-qwen-webhook-secret: $QWEN_CHANNEL_GITHUB_CI_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "push",
    "targetRef": "operator",
    "title": "CI pipeline finished",
    "payload": {
      "targetRef": "refs/heads/main",
      "repository": "qwen-code",
      "status": "success"
    }
  }'
```

Rotas de webhook autenticam com o header de secret do webhook, mesmo quando o `qwen serve` está rodando com bearer auth habilitado. Não compartilhe o bearer token do daemon com provedores de webhook. Configuração de webhook e valores de `secretEnv` são carregados quando o daemon inicia; reinicie o `qwen serve` após alterar fontes de webhook ou rotacionar secrets. Uma resposta `202 {"accepted": true}` significa que o worker de canal aceitou a propriedade da tarefa, não que a resposta final já foi entregue ao chat. Verifique os logs do daemon e do worker de canal, além de `/daemon/status`, ao solucionar falhas de entrega.

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