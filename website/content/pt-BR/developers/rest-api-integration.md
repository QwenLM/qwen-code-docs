# Guia de integração com a API REST

Para equipes que estão integrando o Qwen Code em seu próprio produto via HTTP: execute `qwen serve`
como backend e controle a partir do seu próprio front end.

Esta página é o ponto de entrada. A referência completa de rotas é
[`qwen-serve-protocol.md`](./qwen-serve-protocol.md); os detalhes internos são o
[deep dive do daemon](./daemon/00-index.md); um passo a passo executável em TypeScript está em
[`examples/daemon-client-quickstart.md`](./examples/daemon-client-quickstart.md).

## Quais caminhos existem

Seis maneiras de construir sobre o daemon, separadas por uma pergunta — **quanto do
front end você controla?**

| Caminho                                | Você controla                     | Status                                                                                                                                                                                                                         |
| -------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| daemon + Web Shell integrado           | nada — use como entregue          | disponível hoje ([guia do usuário](../users/qwen-serve.md))                                                                                                                                                                    |
| daemon `--no-web` + sua própria UI     | o front end inteiro               | disponível hoje — **esta página**                                                                                                                                                                                              |
| daemon + Web Shell com marca própria   | marca, não código                 | não construído ([#11357](https://github.com/QwenLM/qwen-code/issues/11357))                                                                                                                                                    |
| daemon + build do Web Shell auto-hospedado | o build do front end          | não construído ([#11358](https://github.com/QwenLM/qwen-code/issues/11358))                                                                                                                                                    |
| daemon via SDK `DaemonClient`          | código do cliente, nunca HTTP puro | disponível hoje ([TS](./sdk-typescript.md), [Java](./sdk-java.md)) — o [Python SDK](./sdk-python.md) é apenas transporte por processo e não tem cliente daemon, então uma integração Python usa o caminho 2 via HTTP puro      |
| daemon via bridge MCP                  | nada — outro agente o controla    | disponível como `qwen-serve-mcp` em ` @qwen-code/sdk` — veja o [README da bridge](../../packages/sdk-typescript/src/daemon-mcp/serve-bridge/README.md); `QWEN_BRIDGE_ALLOW_GLOBAL_SCOPE` opcionalmente permite mutações de escopo global |

O `qwen -p` headless e o ACP via stdio para editores são caminhos de integração
separados. Canais e extensões também podem ser executados pelo daemon; consulte o
[guia de canais](../users/features/channels/overview.md) e a
[referência de extensões](./qwen-serve-protocol.md#extension-management-v2-wire-contract).

## Duas coisas para saber antes de projetar

**O daemon não executa inferência no próprio processo.** Ele cria processos filhos
`qwen --acp` e faz a mediação entre eles e o HTTP. Ele executa o script de entrada
da CLI sob o mesmo binário do Node, usando `QWEN_CLI_ENTRY` ou, caso contrário,
`process.argv[1]`. Um backend Node embarcado deve apontar `QWEN_CLI_ENTRY` para o
script de entrada da CLI Qwen instalada; não há busca por `qwen` no `PATH`. Um
ponto de entrada ausente se manifesta como `MissingCliEntryError`.

No estado estável, há **um processo filho por runtime de workspace ativo**, não um
por sessão. Cada sessão em um workspace multiplexa nesse processo filho e
compartilha seu processo, estado OAuth, cache de arquivos e análise de memória
hierárquica. Portanto, o domínio de falha é o workspace: se o processo filho sai,
todas as sessões multiplexadas nele são encerradas juntas. Dimensione o contêiner
para o daemon mais um processo filho por workspace registrado, com margem para um
processo filho extra por runtime durante uma troca de canal. Quando as sessões
devem falhar independentemente, execute daemons separados —
`--max-sessions` limita a concorrência, não o raio de impacto.

**A autenticação é de operador único.** O token bearer do runtime concede acesso a
toda a API protegida por bearer, e um chamador de loopback confiável obtém
autoridade total, incluindo execução de código como o usuário do daemon. Não há
modelo de principal por usuário final. Se você está colocando
isto atrás de um produto multiusuário, seu backend é responsável pela identidade
do usuário e não deve passar o token do daemon para navegadores. Implantação
containerizada e multi-tenant são explicitamente adiadas — consulte "v0.16-alpha
known limits" no [guia do usuário](../users/qwen-serve.md).

A entrada de webhook de canal configurado (`POST /channels/:channelName/webhooks/:source`)
usa sua própria autenticação `x-qwen-webhook-secret` antes da autenticação
bearer; ela permanece inerte até que uma fonte de webhook de canal seja configurada.

## Iniciar o daemon

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"

qwen serve --no-web --require-auth \
  --hostname 0.0.0.0 --port 4170 \
  --workspace /srv/project
```

`--no-web` preserva as rotas listadas abaixo, mas desabilita os ativos do Web Shell e
superfícies dependentes: no macOS, as rotas `/live/*` e o socket `/live/host`, e em
todas as plataformas `GET /mcp-app-sandbox`. Passe o token por variável de ambiente em vez de
`--token`, que é legível por qualquer usuário local através de `/proc/<pid>/cmdline`.

Os exemplos Bash abaixo passam o cabeçalho Authorization através de um descritor de arquivo
usando o builtin `printf` do shell, mantendo o token fora dos argumentos do curl.

## As rotas que uma integração realmente usa

A maior parte do que o daemon registra existe para acionar o Web Shell — operações
git, instalação de extensões, confiança de workspace, voz, tarefas agendadas — e
muda com essa UI. O subconjunto abaixo é uma ordem de grandeza menor.

Estas são as rotas que uma integração REST precisa. Trate o restante como interno.

### Descoberta

| Rota                                                             | Finalidade                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`GET /health`](./qwen-serve-protocol.md#get-health)             | Sonda de atividade                                                             |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | Pré-voo — leia `workspaceCwd` e `policy.permission` antes de qualquer outra coisa |

### Ciclo de vida de sessão

| Rota                                                                                                                                               | Finalidade                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`POST /session`](./qwen-serve-protocol.md#post-session)                                                                                           | Criar. Envie `sessionScope: "thread"` para uma conversa independente |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid)                                                                                 | Fechar. A sessão persistida sobrevive e pode ser recarregada         |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload) · [`/resume`](./qwen-serve-protocol.md#post-sessionidresume)               | Restaurar uma sessão persistida                                      |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat)                                                                  | Adiar o ceifador de inatividade                                      |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata)                                                                  | Metadados da sessão                                                  |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel)                                                                          | Trocar modelo dentro do serviço vinculado                            |
| `GET /session/:id/status`                                                                                                                          | Status do runtime — _ainda sem seção de referência dedicada_         |

### Prompts e streaming

| Rota                                                                              | Finalidade                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt)       | Submeter. Retorna `202` na **admissão**, não na conclusão |
| [`POST /session/:id/cancel`](./qwen-serve-protocol.md#post-sessionidcancel)       | Cancelar apenas o prompt ativo                          |
| [`GET /session/:id/events`](./qwen-serve-protocol.md#get-sessionidevents-sse)     | Stream SSE. Inscreva-se **antes** de fazer o prompt     |
| [`GET /session/:id/transcript`](./qwen-serve-protocol.md#get-sessionidtranscript) | Histórico de conversas                                  |
| [`GET /session/:id/context`](./qwen-serve-protocol.md#get-sessionidcontext)       | Uso da janela de contexto                               |
| `GET /session/:id/export` · `GET /session/:id/pending-prompts`                    | _Ainda sem seções de referência dedicadas_              |

### Permissões

| Rota                                                                               | Finalidade                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/permission/:requestId`                                          | Responder a um `permission_request`. Roteado para o runtime que possui a sessão, portanto está correto em qualquer estado de workspace — _ainda sem seção dedicada_                                                                                                                            |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid) | Forma global do processo, conectada apenas ao bridge do workspace **primário**: retorna `404` para uma sessão pertencente a outro runtime registrado, com o mesmo corpo de um voto perdido sob a política padrão `first-responder` — portanto, um `404` aqui não significa por si só que a solicitação já foi respondida |

### Contexto de workspace somente leitura

| Rota                                                                                                         | Finalidade                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`GET /file`](./qwen-serve-protocol.md#get-file) · [`/file/bytes`](./qwen-serve-protocol.md#get-filebytes)   | Ler um arquivo ou um intervalo de bytes                                                                                                                      |
| `GET /stat` · `GET /list` · `GET /glob`                                                                      | Metadados de caminho, listagem de diretório, glob — _ainda sem seções dedicadas_                                                                             |
| `GET /workspace/tools`                                                                                       | Ferramentas reportadas pelo processo filho ACP ativo; sem um, a resposta tem `acpChannelLive: false`, `tools: []` e um erro `not_started` — _ainda sem seção dedicada_ |

> **Cobertura da referência.** 17 das 25 rotas acima têm seções dedicadas.
> Das 8 marcadas de outra forma, algumas são mencionadas apenas de passagem e três estão
> inteiramente ausentes: `GET /session/:id/pending-prompts`,
> `POST /session/:id/permission/:requestId` e `GET /workspace/tools`.
> Fechar essa lacuna é rastreado em
> [#11359](https://github.com/QwenLM/qwen-code/issues/11359).

## Fluxo mínimo

**1. Pré-voo.** Leia `workspaceCwd` (para poder omitir `cwd` na criação) e
`policy.permission` (para saber quem pode responder a solicitações de permissão).

```bash
curl -sH @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") http://daemon:4170/capabilities
```

**2. Criar uma sessão.** Use `sessionScope: "thread"` a menos que os chamadores devam
compartilhar uma conversa — o `"single"` padrão faz uma segunda criação no mesmo
workspace _reutilizar_ a sessão existente, serializando chamadores não relacionados
através de uma fila.

```bash
curl -sX POST http://daemon:4170/session \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"sessionScope":"thread"}'
# → {"sessionId":"…","workspaceCwd":"/srv/project","attached":false}
```

**3. Inscrever-se antes de fazer o prompt.** `Last-Event-ID: 0` faz replay a partir do
evento retido mais antigo, que é como você captura eventos disparados entre a criação e
a inscrição — notavelmente `model_switch_failed`. Em um **attach** (o `sessionScope: "single"`
padrão reutilizando uma sessão existente), esse evento é o único sinal de que um
`modelServiceId` inválido foi rejeitado, porque a falha é deliberadamente não propagada
como um erro HTTP. Em uma **criação nova** que carrega `modelServiceId` — que o corpo do
passo 2 não carrega — o corpo `200` também carrega `modelApplied`, `false` quando a troca
foi rejeitada, e esse é o determinístico para agir, em vez de um evento em um anel limitado.
Uma criação sem `modelServiceId` não tem a chave `modelApplied`.

```bash
curl -N http://daemon:4170/session/$SID/events \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") \
  -H 'Accept: text/event-stream' -H 'Last-Event-ID: 0'
```

Cada linha `data:` é um envelope completo em uma linha; o `type` do envelope corresponde
à linha `event:`.

O replay é limitado por `--event-ring-size` e um orçamento fixo de 8 MiB por assinatura.
Se o stream emitir `state_resync_required` com
`reason: "replay_budget_exceeded"`, recupere através de `POST /session/:id/load`
em vez de tratar o replay como completo.

**4. Prompt.** `202` significa admitido, não finalizado. Correlacione `turn_complete` /
`turn_error` no stream por `promptId`. Leia `stopReason` em `turn_complete`;
em `turn_error`, leia `message` e qualquer `code` / `errorKind` opcional — consulte
[`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt).

```bash
curl -sX POST http://daemon:4170/session/$SID/prompt \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → 202 {"promptId":"…","lastEventId":42}
```

**5. Responder a solicitações de permissão.** Quando o agente quer executar uma ferramenta _e seu
modo de aprovação pede confirmação_, ele emite `permission_request` e o turno
bloqueia até que alguém responda ou você cancele — **por padrão não há timeout**
(`--permission-response-timeout-ms` padrão é `0` = espera indefinida), então uma
solicitação não respondida continua ocupando um slot na fila de prompts da sessão até que você
cancele ou feche a sessão. Configure seu próprio deadline se o fluxo precisar de um.

O modo é a configuração própria do processo filho Qwen `tools.approvalMode`, resolvida a partir das
configurações do host do daemon e do diretório `--workspace`; o daemon não fixa
nada no spawn. Seu padrão é `auto`, que aprova uma classe de chamadas de ferramenta
sem perguntar — essas não publicam `permission_request` — e ainda pergunta
para o restante. Uma pasta de workspace não confiável é forçada para `default` (perguntar),
e é por isso que uma implantação vê esses eventos e outra não vê nenhum, e
`GET /capabilities` reporta a política de mediação de votos em vez do modo de aprovação,
então o pré-voo não dirá em qual postura você está. Se sua
integração depende de gate de aprovação, fixe `tools.approvalMode` explicitamente e
decida de antemão como ela responde: a auto-aprovação já pode estar em vigor sem
que ninguém a tenha escolhido.

Responda na rota de escopo da sessão: ela é roteada para o runtime que possui a
sessão, então funciona independente da configuração do workspace.

```bash
curl -sX POST http://daemon:4170/session/$SID/permission/$REQUEST_ID \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"outcome":{"outcome":"selected","optionId":"proceed_once"}}'
```

**6. Fechar.** `DELETE /session/$SID` → `204`. A sessão em disco é retida.

## Operações

| Preocupação        | Onde                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Limites de concorrência | `--max-sessions`, `--max-total-sessions`; criações acima do limite retornam `503` com `Retry-After`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Limitação de taxa  | `--rate-limit` mais as flags por classe `--rate-limit-*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Limpeza de inatividade | `--session-idle-timeout-ms`; mantenha vivo com `POST /session/:id/heartbeat`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Memória            | `--child-heap-mode` é apenas observação. `--memory-budget-mb` controla o pool de crescimento adaptativo do diário ativo para `POST /session/:id/load`, não replay SSE; fixar `--max-journal-bytes` ou `--max-journal-events` desabilita o crescimento. Nenhuma das flags dimensiona processos filhos ou recusa spawns, nem governa seu limite real de heap (`--max-old-space-size`, derivado da memória do host). Consulte [Configuration](./daemon/17-configuration.md) para cálculo de orçamento. O replay SSE é limitado separadamente por `--event-ring-size` e um orçamento fixo de 8 MiB por assinatura; uma cauda omitida produz `state_resync_required` com `reason: "replay_budget_exceeded"` |
| Prazos de prompt   | `--prompt-deadline-ms`; expiração emite `turn_error`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Erros              | [Taxonomia de erros](./daemon/18-error-taxonomy.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Observabilidade    | [Observabilidade](./daemon/19-observability.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Lista completa de flags | [Configuração](./daemon/17-configuration.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
