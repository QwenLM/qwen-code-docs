# Contatos de canal observados com escopo de workspace

## Problema

Workers de canal gerenciados pelo daemon recebem identificadores de usuário,
grupo e tópico da plataforma em mensagens recebidas, mas os identificadores são
transitórios. Clients de workspace autenticados precisam de uma API de leitura
que liste contatos de IM observados recentemente, para que um usuário possa
selecionar um alvo de entrega completo na plataforma sem procurar ou redigitar
identificadores manualmente.

## Escopo

Esta mudança observa mensagens recebidas aceitas, persiste um grafo de
relacionamentos limitado por workspace do daemon e retorna identificadores
completos de plataforma para os canais DingTalk, Feishu, Telegram e WeCom.

Ela não altera a configuração de webhook nem a entrega proativa, não consulta um
diretório de plataforma, não alega retornar a composição completa de um grupo,
não observa a saída do bot e não faz backfill de tráfego histórico. O
`qwen channel start` standalone permanece inalterado.

## Posse e persistência

O runtime do workspace do daemon é dono do registry:

```text
$QWEN_HOME/channels/daemon/<workspaceHash>/observed-contacts.json
```

`QWEN_HOME` é do nível do processo, mas `<workspaceHash>` particiona os dados
pelo caminho canônico do workspace. O registry não é armazenado no checkout do
workspace e não é compartilhado como um único grafo global do processo. Seu
diretório usa modo `0700` onde suportado; o arquivo JSON atômico usa modo
`0600`.

O registry armazena no máximo 500 observações de relacionamento em todos os
canais e conversas do workspace. Cada observação contém `channelName`, uma
identidade de usuário, uma identidade opcional de grupo, uma identidade opcional
de tópico e `lastObservedAt`. A chave de deduplicação é
`[channelName, user.id, group?.id, topic?.id]`. Uma conversa ruidosa pode,
portanto, expulsar observações mais antigas de outra conversa. Observações mais
antigas que a janela legível máxima de 365 dias são removidas na próxima escrita
aceita.

## Limite de observação

O registro ocorre depois que o preflight compartilhado de entrada aceita uma
mensagem de IM real e antes que o tratamento de comando ou de Agent comece.
Política de direto/grupo, menção, allowlist de remetente e rejeição de
pareamento, portanto, acontecem antes da persistência.

O mesmo objeto `Envelope` é registrado no máximo uma vez. Uma mensagem posterior
renova o timestamp e os rótulos do relacionamento correspondente. A persistência
é best-effort: um erro sanitizado é registrado em log sem identificadores e o
tratamento da mensagem aceita continua.

O registry nunca armazena texto de mensagem, IDs de mensagem, anexos, payloads,
credenciais, requisições de webhook, envios proativos ou saída de bot.

## Modelo de relacionamento

```ts
interface ObservedChannelContactObservation {
  user: { id: string; label: string };
  group?: { id: string; label: string };
  topic?: { id: string; label: string };
}
```

- Uma mensagem direta registra um usuário de nível superior a partir do
  `senderId` completo da plataforma.
- Uma mensagem de grupo registra o grupo a partir do `chatId` completo da
  plataforma e o usuário observado dentro desse grupo.
- Uma mensagem de grupo em thread também registra o tópico a partir do
  `threadId` e o usuário observado dentro desse tópico.
- Um usuário visto apenas em grupos não aparece no `users` de nível superior. Se
  o mesmo usuário também enviar uma mensagem direta, ele aparece tanto no nível
  superior quanto sob os grupos relevantes.
- `groups[].users` e `groups[].topics[].users` significam usuários observados
  nessas conversas. Não são listas autoritativas de composição da plataforma.
- Rótulos de remetente usam o nome de exibição de entrada sanitizado, com
  fallback para o ID de usuário completo. Rótulos de grupo usam um nome
  sanitizado quando o envelope de entrada aceito fornece um; o DingTalk mapeia
  `conversationTitle` e o Telegram mapeia `chat.title`. Rótulos de grupo do
  Feishu e do WeCom, e todos os rótulos de tópico, fazem fallback para seus IDs
  completos.

O Feishu mapeia `root_id` para `threadId`; o Telegram mapeia `message_thread_id`
para `threadId`. Os envelopes atuais de DingTalk e WeCom não expõem um
identificador de tópico estável, então suas observações param no nível do grupo.

## Atualidade (freshness)

Pessoas, conversas e relacionamentos mudam. A API de leitura filtra observações
em vez de apresentar o registry como verdade permanente:

- atualidade padrão: sete dias;
- override do chamador: `freshWithinSeconds`, de 1 segundo até 365 dias;
- timestamps de usuário, usuário de grupo, usuário de tópico, grupo e tópico são
  derivados independentemente de observações recentes;
- observação passiva não pode detectar imediatamente uma saída, exclusão ou
  renomeação que não produz nova mensagem, então relacionamentos obsoletos
  desaparecem apenas quando excedem a janela solicitada.

## API de leitura

Workspace primário:

```http
GET /workspace/channel/observed-contacts?freshWithinSeconds=604800
Authorization: Bearer <daemon token>
```

Workspace registrado selecionado:

```http
GET /workspaces/:workspace/channel/observed-contacts?freshWithinSeconds=604800
Authorization: Bearer <daemon token>
```

Exemplo:

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
      "topics": [
        {
          "label": "om_complete_root_id",
          "id": "om_complete_root_id",
          "lastObservedAt": "2026-07-17T08:05:00.000Z",
          "users": [
            {
              "label": "Example User",
              "id": "ou_complete_user_id",
              "lastObservedAt": "2026-07-17T08:05:00.000Z"
            }
          ]
        }
      ]
    }
  ]
}
```

Respostas usam `Cache-Control: no-store`. A rota primária lê apenas a partição do
workspace primário. A rota qualificada requer um runtime registrado e confiável
exato e nunca faz fallback para o primário em workspaces desconhecidos, não
confiáveis, em bootstrap, em drenagem ou removidos.

Um registry ausente retorna um grafo vazio. Dados malformados retornam um `500`
sanitizado com código `channel_observed_contacts_unavailable`. Exclua o arquivo
`observed-contacts.json` do workspace para resetar um registry malformado ou não
suportado; o tráfego aceito o recria. Atualidade inválida retorna
`400 invalid_freshness`.

Clientes descobrem a rota por meio da capability de serve
`workspace_channel_observed_contacts`. A rota é somente leitura e é registrada
após a autenticação bearer do daemon.

## Compatibilidade

Parsing de webhook, requisições, resolução de alvo e entrega são idênticos ao
`main`. Esta API apenas expõe identificadores observados; os chamadores decidem
como usá-los. O registry começa na versão 1 de schema porque o protótipo
anterior de referência opaca nunca foi lançado.

## Estratégia de testes

- Testes de canal base cobrem o limite de preflight, normalização de tópico,
  deduplicação de Envelope e falhas de persistência não bloqueantes.
- Testes do store cobrem semântica de direto versus grupo, relacionamentos de
  grupo/tópico, atualidade, renovações, limites, permissões e dados malformados.
- Testes de rota cobrem identificadores completos, respostas no-store, validação
  de atualidade, posse exata de workspace e falhas sanitizadas.
- Testes de servidor cobrem autenticação bearer e anúncio de capability.
- Testes de regressão de webhook verificam que nenhum comportamento difere do
  `main`.
