
# DingTalk Workspace (DWS)

O canal DWS usa uma conta já autenticada pelo CLI do DingTalk Workspace. Ele recebe mensagens diretas e de grupo, reconhece cartões de notificação de menção a documentos do DingTalk e publica a resposta do agente de volta na mensagem original ou no comentário do documento.

Isso é separado do [canal de bot do DingTalk](./dingtalk). Continue usando `type: "dingtalk"` para um bot de aplicativo dedicado; use `type: "dws"` quando o Qwen Code deve agir através de um login DWS existente.

## Pré-requisitos

Instale o DWS CLI 1.0.57 ou mais recente no host que executa o Qwen Code, e garanta que `dws` seja resolvido a partir do `PATH` desse processo:

```bash
dws version --format json
```

Autentique-se no mesmo host:

```bash
dws auth login
dws profile list --format json
dws auth status --format json
```

Em um servidor sem interface gráfica, use `dws auth login --device`. Um canal fixa exatamente um perfil existente na inicialização. Defina `profile` como um nome de perfil ou corpId exato, ou omita para fixar a entrada marcada como `isCurrent`. O canal trata cada login DWS da mesma forma e não depende de metadados de `user_id`.

## Configuração

Adicione um canal ao `~/.qwen/settings.json`:

```json
{
  "channels": {
    "dws-work": {
      "type": "dws",
      "profile": "profile-name-or-corp-id",
      "senderPolicy": "pairing",
      "groupPolicy": "pairing",
      "watchTodos": true,
      "groups": {
        "*": { "requireMention": true }
      },
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project"
    }
  }
}
```

O modo de aprovação YOLO está disponível para bots de resposta que devem executar chamadas de ferramenta sem confirmações interativas:

```json
{
  "channels": {
    "dws-answers": {
      "type": "dws",
      "senderPolicy": "pairing",
      "groupPolicy": "pairing",
      "approvalMode": "yolo",
      "cwd": "/path/to/answer-bot"
    }
  }
}
```

O modo YOLO aprova automaticamente toda chamada de ferramenta. Use-o apenas para uma conta e workspace de bot confiáveis.

`senderPolicy` e `groupPolicy` têm padrão `pairing` para um canal DWS gerenciado recém-criado. Aprove um usuário ou grupo com o código retornado pelo canal:

```bash
qwen channel pairing approve dws-work CODE
```

`senderPolicy` controla remetentes de mensagens diretas, autores de notificações de documentos, criadores de todos nativos e remetentes em grupos `open` ou `allowlist`. `groupPolicy` controla conversas em grupo. Um grupo pareado aprovado segue o comportamento compartilhado do canal e autoriza seus membros; grupos open e allowlist também precisam passar pelo `senderPolicy`.

`groups` controla o comportamento de menção. Um ID de grupo concreto sobrescreve `"*"`. Com `requireMention: true`, apenas uma mensagem com @ ativa o canal. Com `requireMention: false`, mensagens ordinárias também são recebidas após as políticas de grupo e remetente passarem.

As menções de grupo usam o stream de eventos pessoais em tempo real primeiro. O canal também verifica o histórico recente de mensagens com `@` a cada cinco segundos, então menções de grupos externos são recuperadas quando o DingTalk as omite do stream de eventos pessoais. As mensagens são deduplicadas por conversa e ID de mensagem em ambos os caminhos.

Quando uma mensagem cita outra mensagem do DingTalk, o texto citado é incluído como contexto de resposta para o agente tanto no caminho em tempo real quanto no fallback de histórico.

Mensagens diretas ordinárias são recuperadas da mesma forma: uma verificação de histórico de cinco segundos re-processa qualquer mensagem direta omitida pelo stream em tempo real, deduplicada por conversa e ID de mensagem em ambos os caminhos.

## Menções a Documentos

Não há lista de observação de documentos ou base de conhecimento. Para iniciar uma tarefa de documento:

1. Adicione um comentário em um documento do DingTalk que @mencione a conta autenticada.
2. Ative a opção que envia uma notificação do DingTalk para essa conta.
3. O DWS entrega o cartão de notificação através do histórico de mensagens diretas da conta.

O canal extrai o ID do documento, a chave do comentário e a solicitação dessa notificação. Ele lê o documento referenciado para contexto, adiciona a reação de olhos `暗中观察` do DingTalk enquanto a tarefa é executada, e responde ao comentário original do documento. O stream de eventos DWS em tempo real é usado quando contém o cartão; uma verificação incremental de histórico a cada cinco segundos cobre cartões omitidos pelo stream de eventos atual.

Comentários que não geram uma notificação são ignorados por design. Mensagens de notificação duplicadas para o mesmo comentário de documento são executadas apenas uma vez. Tarefas de documento seguem o `senderPolicy` e suportam `approvalMode` `default`, `plan` ou `yolo`; `default` é usado quando omitido.

## Alterações em Todos Nativos

Defina `watchTodos: true` para fazer polling dos todos nativos pendentes do perfil DWS selecionado onde a conta é um executor. A opção tem padrão `false`, então adicionar um canal DWS nunca executa todos existentes implicitamente.

A primeira varredura bem-sucedida estabelece uma linha de base e não inicia todos históricos. Varreduras posteriores executam uma tarefa quando um todo é recém-atribuído, reaberto ou seus campos acionáveis mudam, incluindo título, prioridade, prazo ou responsáveis. A resposta final é adicionada como um comentário no todo de origem. Metadados apenas de comentário e timestamps de modificação são excluídos da detecção de mudanças para que a própria resposta do canal não possa disparar um loop. Conclusão ou remoção retira o todo do conjunto pendente; reabri-lo cria um novo gatilho.

Todos nativos seguem o `senderPolicy` usando a identidade do criador do todo. Sob `pairing`, o canal adiciona um comentário com código de pareamento e mantém o todo pendente; após o criador ser aprovado localmente, uma varredura posterior pode processar o todo inalterado. O polling é executado a cada 30 segundos e permanece com escopo na organização atual do perfil fixado.

## Iniciando e Verificando

Execute o canal diretamente:

```bash
qwen channel start dws-work
```

Ou deixe o daemon gerenciá-lo:

```bash
qwen serve --workspace /path/to/your/project --channel dws-work
```

Não execute ambas as formas ao mesmo tempo porque elas compartilham a concessão do serviço de canal.

Para verificação local, envie uma mensagem direta de outra conta, aprove o pareamento se necessário, e verifique se a reação de olhos aparece enquanto a tarefa é executada. Depois, adicione um comentário de documento com notificação de @menção ativada. O canal deve reagir à mensagem de notificação, ler o documento e postar a resposta final sob o comentário original. Um comentário com notificação desativada não deve produzir nenhuma tarefa.

O canal ignora eventos de IDs de remetente que o DWS identifica como a conta autenticada, prevenindo loops de resposta e pareamento sem inferir identidade a partir do texto da mensagem. Iniciar as fontes IM requer essa identidade própria autoritativa: se a conta autenticada não expõe um openDingTalkId e nenhuma sessão anterior sob o mesmo perfil registrou um, o canal se recusa a conectar. Uma reconexão que perde temporariamente o ID mantém o filtro nos IDs de remetente próprio registrados anteriormente.
