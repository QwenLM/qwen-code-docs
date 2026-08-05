# Metadata de origem de sessão do daemon

## Motivação

Os clientes do daemon precisam identificar qual integração criou uma sessão depois
que o daemon reinicia. O metadata de bridge apenas ao vivo é insuficiente porque
as entradas ao vivo são reconstruídas a partir do transcript persistido no load ou
resume.

## API

`POST /session` aceita dois campos imutáveis opcionais:

- `sourceType`: um token de origem em minúsculas (`[a-z][a-z0-9_-]{0,63}`).
- `sourceId`: um identificador não vazio de no máximo 256 caracteres. Ele é válido
  apenas quando `sourceType` está presente.

Os campos são retornados nas respostas de criação de sessão, status e lista de
sessões do workspace. Sessões existentes omitem ambos os campos. Sob
`sessionScope: single`, um attach retorna a origem da sessão existente e nunca
adota a origem da requisição de anexação.

Listas de sessões do workspace aceitam os parâmetros de query `sourceType` e
`sourceId` opcional. `sourceId` exige `sourceType`; quando ambos estão presentes,
eles são correspondidos juntos. Filtros de origem não são combinados com a visão
organizada.

Tarefas agendadas do daemon marcam sua sessão dedicada com
`sourceType: "scheduled_task"` e o id durável da tarefa como `sourceId`.

Workers de canal do daemon marcam as sessões que criam com `sourceType: "channel"`
e o nome da instância de canal configurada (por exemplo, `feishu-main`) como
`sourceId`, para que a instância do canal — e, através da configuração do canal, o
tipo de canal (dingtalk/feishu/...) — seja atribuível no plano de dados do daemon.
Carregar ou anexar uma sessão existente nunca remarca sua origem de criação.

## Persistência

Uma sessão nova armazena um registro de sistema `session_source` próximo ao início
do seu transcript JSONL:

```json
{
  "type": "system",
  "subtype": "session_source",
  "systemPayload": {
    "sourceType": "web_shell",
    "sourceId": "window-1"
  }
}
```

A bridge pede ao filho da sessão para anexar este registro através de um método de
controle ACP aguardado, correspondendo à fronteira de persistência existente de
`parent_session`. A resposta de criação expõe `sourcePersisted` para que um
chamador possa detectar uma origem degradada apenas ao vivo se a gravação falhar.

`SessionService` lê o registro enquanto varre o início do transcript para respostas
de lista e antes de load/resume, para que resumos ao vivo restaurados retenham a
origem.

## Branching

Transcripts bifurcados não devem copiar `session_source`; caso contrário, um novo
ramo reivindicaria o criador da sessão original. Um ramo não tem origem até que seu
caminho de criação atribua uma explicitamente.

## Compatibilidade

Ambos os campos são opcionais. Transcripts e clientes mais antigos permanecem
válidos. REST, ACP-over-HTTP e o SDK TypeScript encaminham os campos de criação e
de filtro de lista. Daemons que implementam os campos anunciam
`session_source_metadata`; o SDK verifica essa capability antes de enviar metadata
de origem ou filtros de origem, para que um daemon mais antigo não possa
ignorá-los silenciosamente e retornar resultados não filtrados. Os valores são
apenas para atribuição e não devem ser usados como sinal de autorização, porque os
clientes podem fornecê-los.

Se um cliente desconecta antes de receber uma sessão recém-criada, o daemon remove
tanto a sessão ao vivo quanto seu transcript recém-gravado. Um attach concorrente
impede ambas as operações, preservando a sessão para o cliente anexado.
