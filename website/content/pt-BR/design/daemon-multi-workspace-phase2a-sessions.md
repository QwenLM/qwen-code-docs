# Fundamentos da Fase 2a para Sessões Multi-Workspace

> **Status histórico:** Este documento registra a sequência da Fase 2a/início
> da Fase 2b, não a superfície completa atual. O modelo de propriedade, a
> semântica de falha, os limites de recursos e as rotas restantes somente
> primárias são agora definidos por
> [`daemon-multi-workspace-hardening.md`](./daemon-multi-workspace-hardening.md).
> Os snapshots de rewind de sessão ao vivo, o rewind e as limitações de shell
> registrados aqui foram substituídos por
> [`daemon-multi-workspace-session-file-ops.md`](./daemon-multi-workspace-session-file-ops.md).
> A classificação posterior somente primária das mutações de sessão ao vivo
> continue, language e artifact também foi substituída: essas rotas REST
> singulares agora despacham para o runtime de workspace confiável
> proprietário. Outras afirmações com escopo de fase também podem ter sido
> substituídas por registros de design posteriores e não devem ser tratadas
> como o inventário de rotas atual.

## Resumo

Este documento registra o contrato de sessões multi-workspace para a issue
#6378 após o PR da Fase 1 do `WorkspaceRegistry`, o PR de fundamentos da Fase
2a e o primeiro PR de expansão de rotas da Fase 2b. A Fase 2a foi dividida em
dois PRs de implementação: o PR 1 trouxe o isolamento de env e as guardrails
de admissão total enquanto o multi-workspace permanecia com gate; o PR 2
conectou o despacho de sessões ao vivo não primárias e publicou o esquema
aditivo de capabilities/status. O PR 1 da Fase 2b adiciona um índice de
proprietário de sessão e expande a superfície de rotas somente de sessões sem
mover clientes de workspace de file, memory, MCP, settings, voice, workers de
canal, ACP ou SDK.

O trabalho multi-workspace permanece apenas para sessões. A Fase 2a não
adicionou rotas no plural, um `WorkspaceDaemonClient`, ACP/WebSocket
qualificado por workspace, migração de file, memory, MCP, settings, voice ou
channel-worker. O PR 1 da Fase 2b adiciona apenas o alias plural de listagem
de sessões descrito abaixo; ele ainda não adiciona APIs de cliente de
workspace nem migra superfícies fora de sessão. O PR 1 não adicionou
capabilities `workspaces[]`, `multi_workspace_sessions`, despacho de rotas ou
construção de runtime não primário.

## Contrato Base

- `--workspace` é repetível na camada do parser de CLI para que o yargs preserve
  a entrada em array em vez de colapsá-la.
- O fast path do serve faz fallback para o parser completo quando valores de
  workspace repetidos estão presentes.
- Um array de workspace com um único item é tratado como o workspace primário e
  mantém o comportamento existente de workspace único.
- O PR 1 manteve múltiplos workspaces explícitos com gate antes do boot do runtime.
- O PR 2 aceita workspaces explícitos distintos e não aninhados para o modo
  multi-workspace apenas para sessões.
- Entradas canônicas duplicadas de workspace ainda falham explicitamente.
- Entradas aninhadas de workspace ainda falham explicitamente.
- O primeiro workspace explícito é o workspace primário e permanece espelhado
  pelos campos de compatibilidade legados `workspaceCwd` /
  `app.locals.boundWorkspace`.

O contrato interno do `WorkspaceRuntime` agora carrega metadados estáveis para
trabalhos posteriores da Fase 2a:

- `workspaceId`: hash estável do cwd canônico do workspace.
- `workspaceCwd`: cwd canônico do workspace.
- `primary`: true para o runtime primário.
- `trusted`: metadados de confiança no boot; o fallback direto do
  `createServeApp` permanece false, a menos que o ambiente de produção passe um
  valor trusted explícito.
- `env`: metadados de origem de env local do runtime. Na produção de
  workspace único, o runtime primário agora recebe um snapshot de env efetivo
  calculado e uma origem de env mutável que pode ser atualizada após o reload
  de env do daemon. O fallback direto do `createServeApp` permanece com os
  metadados do processo pai.

O `WorkspaceRegistry` interno suporta busca exata por cwd, busca exata por id,
fallback primário de `resolveWorkspaceCwd(undefined)` e resolução de
proprietário de sessão ativa. A resolução de proprietário ativo verifica apenas
os resumos da bridge do runtime; ela não verifica armazenamento persistido,
não cria filhos e ainda não roteia nenhuma requisição. Proprietários ativos
duplicados falham de forma fechada (fail closed) como um resultado ambíguo.

O `createServeApp` pode aceitar um registry injetado para testes e montagem
futura. O PR de fundamentos manteve os módulos de rota nas entradas do runtime
primário; o PR 2 estende apenas a fiação das rotas de sessão ao vivo, SSE e
permissão de sessão com o registry necessário para o despacho por
proprietário. Os locals legados existentes `app.locals.boundWorkspace` e
`app.locals.fsFactory` permanecem como locals de compatibilidade apenas para o
primário.

## Classificação de Rotas da Fase 2a

O primeiro marco da Fase 2a sem gate deve classificar todas as rotas
`/session/:id/*` antes de habilitar múltiplos workspaces explícitos.

Rotas despachadas na Fase 2a:

- `POST /session`
- `GET /session/:id/events`
- `POST /session/:id/prompt`
- `POST /session/:id/cancel`
- `POST /session/:id/permission/:requestId`
- `POST /session/:id/heartbeat`
- `POST /session/:id/detach`
- `GET /session/:id/pending-prompts`
- `DELETE /session/:id/pending-prompts/:promptId`
- `DELETE /session/:id`
- `GET /session/:id/status`

Adições despachadas na Fase 2b:

- `POST /session/:id/load`
- `POST /session/:id/resume`
- `GET /session/:id/context`
- `GET /session/:id/context-usage`
- `GET /session/:id/stats`
- `GET /session/:id/supported-commands`
- `GET /session/:id/tasks`
- `GET /session/:id/lsp`
- `GET /session/:id/hooks`
- `GET /session/:id/artifacts`

Rotas posteriores ou apenas primárias:

- `GET /session/:id/export`
- `POST /sessions/delete`
- `POST /sessions/archive`
- `POST /sessions/unarchive`
- `PATCH /session/:id/organization`
- mutações de session-group
- mutações de sessão de branch, fork, cd, rewind, shell, model e language
- `POST /permission/:requestId` fora de sessão
- `/acp`

## Requisitos Entre PRs da Fase 2a

- Mantenha os erros de scan (scan misses) como `404 session_not_found`; nunca
  faça fallback para o primário.
- Falhe de forma fechada (fail closed) se mais de um runtime reportar o mesmo
  id de sessão ativa.
- Mantenha a listagem de sessões persistidas não primárias com gate até que a
  propriedade de restauração, as verificações de confiança e a descoberta de
  sessões ativas sejam implementados juntos.
- Reutilize os overlays de env locais do runtime do PR 1 antes do spawn de
  filhos não primários.
- Reutilize a admissão `maxTotalSessions` do PR 1 em todo futuro ponto de
  criação fresca para que o REST e o `/acp` primário não possam contorná-la,
  enquanto o attach ainda contorna a admissão.
- O PR 2 publica `workspaces[]` e `multi_workspace_sessions` apenas depois que
  o loop de despacho de sessões ao vivo estiver completo.
- O PR 2 atualiza os tipos de capability do SDK para o esquema de capacidades
  aditivas, mas a Fase 2a ainda não adiciona um cliente de workspace.

## Guardrails do PR 1

- O env do runtime é calculado a partir do env base do daemon mais o `.env` do
  workspace, env de settings e padrões do Cloud Shell sem alterar o
  `process.env` pai durante a inicialização do runtime.
- O auxiliar de env intencionalmente não virtualiza `QWEN_HOME`, Storage ou o
  roteamento de configuração global. Esses permanecem responsabilidades do
  boot/env base do daemon.
- O spawn do filho ACP aceita um `sourceEnv` explícito, e leitores de
  status/configuração com escopo de workspace de baixo custo usam o env
  injetado em vez de leituras diretas de `process.env`.
- `maxTotalSessions` é um teto opcional de sessões frescas para todo o daemon.
  Ele cobre spawn, restauração de load/resume persistido e criação de sessões
  de branch/fork; o attach o contorna. No modo multi-workspace, quando o
  operador o deixa indefinido e o teto `maxSessions` por workspace é finito, o
  PR 2 deriva o teto total efetivo como
  `maxSessionsPerWorkspace * workspaceCount`; o modo de workspace único mantém
  o padrão histórico de total ilimitado.
- O ponto de admissão da bridge é um hook de reserva síncrono. Criação fresca
  falha libera a reserva, prevenindo venda excessiva concorrente entre
  runtimes uma vez que bridges não primárias existam.
- `/daemon/status.limits.maxTotalSessions` é aditivo. `/capabilities` e os
  tipos de capability do SDK permanecem inalterados até o PR 2 remover o gate
  de sessões multi-workspace.

## Loop Fechado de Sessões do PR 2

O PR 2 remove o gate explícito de boot multi-workspace para o modo do daemon
apenas para sessões. Múltiplos valores explícitos de `--workspace` agora criam
um runtime por workspace canônico, com o primeiro workspace como primário.
Entradas duplicadas e aninhadas de workspace permanecem erros de boot porque
tornam a propriedade de sessão ambígua antes que qualquer despacho em nível de
rota possa resolver uma requisição com segurança.

A montagem de produção mantém as responsabilidades existentes do runtime
primário: identidade do daemon, identidade de log, id de serviço de
telemetria, Web Shell, `/acp`, file, memory, MCP, settings, voice, worker de
canal e rotas REST legadas sem workspace permanecem apenas primários. Runtimes
não primários são runtimes de bridge/serviços de workspace apenas para sessões
REST ao vivo. Seu filho ACP ainda é preguiçoso: o objeto bridge existe no
boot, mas nenhum filho não primário é gerado até uma requisição confiável
`POST /session { cwd }` precisar de uma sessão fresca.

A criação de sessão resolve `cwd` através da correspondência exata de cwd
canônico do `WorkspaceRegistry`. `cwd` omitido resolve para o runtime
primário. `cwd` desconhecido retorna `400 workspace_mismatch`; `cwd` não
primário não confiável retorna `403 untrusted_workspace`; runtimes registrados
confiáveis chamam a bridge desse runtime com seu próprio cwd canônico. Isso
evita intencionalmente correspondência por prefixo, correspondência por
ancestral mais próximo ou busca em armazenamento persistido na Fase 2a.

As rotas despachadas de sessão ao vivo resolvem o runtime proprietário
varrendo resumos de bridge ativas através de
`WorkspaceRegistry.resolveLiveSessionOwner(sessionId)`. `not_found` mapeia
para `404 session_not_found`, e `ambiguous` mapeia para um erro de servidor
fail closed. A varredura é síncrona e apenas ativa; ela nunca gera um filho e
nunca trata um erro como fallback para o primário. O conjunto de rotas
despachadas é exatamente:

- `GET /session/:id/events`
- `POST /session/:id/prompt`
- `POST /session/:id/cancel`
- `POST /session/:id/permission/:requestId`
- `POST /session/:id/heartbeat`
- `POST /session/:id/detach`
- `GET /session/:id/pending-prompts`
- `DELETE /session/:id/pending-prompts/:promptId`
- `DELETE /session/:id`
- `GET /session/:id/status`

`GET /workspace/:id/sessions` resolve primeiro por id exato de workspace e
depois por cwd canônico exato. O primário mantém a mescla existente de
persistido/ativo e o comportamento de visualização organizada. O não primário
retorna apenas sessões ativas, rejeita `archiveState=archived` e rejeita
consultas organizadas/agrupadas porque essas são superfícies apoiadas em
persistência/organização reservadas para fases posteriores.

`/capabilities` permanece retrocompatível: `workspaceCwd` ainda nomeia o
workspace primário. Quando mais de um runtime está registrado, ele adicionalmente
publica `workspaces[]`, `multi_workspace_sessions` e limites de sessão
aditivos. `/daemon/status` adiciona os mesmos metadados `workspaces[]` e
agrega contadores de sessões ativas entre as bridges dos runtimes, deixando as
seções completas de workspace apenas para o primário.

O PR 2 da Fase 2a não adiciona rotas no plural, ACP/WebSocket qualificado por
workspace, migração de file/memory/MCP/settings/voice/channel-worker,
adição/remoção dinâmica, load/resume/export/archive/delete persistido não
primário, branch/fork/cd/rewind, migração de shell/model/language ou APIs de
cliente de workspace do SDK.

## Índice de Proprietário e Expansão de Restauração do PR 1 da Fase 2b

O PR 1 da Fase 2b adiciona um ponto de callback de ciclo de vida da bridge e
um `WorkspaceSessionOwnerIndex` pertencente ao `WorkspaceRegistry`. Eventos de
ciclo de vida de registro/remoção da bridge atualizam o índice em spawn,
load/resume, saída de canal, fechamento, kill e desligamento do daemon. A
resolução de proprietário consulta o índice primeiro, verifica o runtime
indexado com `getSessionSummary`, descarta entradas obsoletas do índice e faz
fallback para a varredura existente de bridge ativas. Acertos de fallback são
armazenados de volta no índice. O índice permanece uma otimização e um ponto
de consistência, não um banco de dados de propriedade persistido.

`POST /session/:id/load` e `POST /session/:id/resume` agora aceitam `cwd`
explícito para qualquer workspace registrado confiável. `cwd` omitido ainda
resolve para o runtime primário. `cwd` desconhecido retorna
`400 workspace_mismatch`; `cwd` não primário não confiável retorna
`403 untrusted_workspace`; se o mesmo id de sessão já está ativo ou sendo
restaurado em outro runtime, a restauração falha de forma fechada com
`409 session_workspace_conflict`. Corridas de restauração no mesmo workspace
mantêm a coalescência existente da bridge e o comportamento
`restore_in_progress`. A restauração ainda lê o armazenamento de sessões
persistidas do caminho de armazenamento existente do workspace solicitado e
não habilita export/archive/delete não primário.

As rotas ativas somente leitura roteadas por proprietário agora usam a bridge
do runtime proprietário: context, context-usage, stats, supported-commands,
tasks, lsp, hooks e artifacts. Essas rotas não alteram o armazenamento
persistido e não exigem estado local de conexão ACP/WebSocket, então podem
seguir o proprietário ativo com segurança.
`GET /session/:id/rewind/snapshots` permanece apenas primário porque o estado
de rewind não faz parte do loop fechado apenas de sessões.

`GET /workspaces/:workspace/sessions` é um alias plural de
`GET /workspace/:id/sessions`. Ambos resolvem primeiro por id exato de
workspace e depois por cwd canônico exato. Workspaces primários mantêm a
semântica de mescla persistido/ativo. O PR 1 da Fase 2b manteve workspaces não
primários apenas ativos e rejeitando visualizações de lista arquivadas ou
organizadas.

## Descoberta de Sessões Persistidas do PR 2 da Fase 2b

A listagem de sessões de workspaces não primários confiáveis agora inclui
sessões persistidas ativas do armazenamento de sessões desse workspace e
mescla resumos ativos correspondentes sem duplicatas. Isso completa o lado de
descoberta do fluxo de restauração da Fase 2b: os clientes podem listar um
workspace secundário confiável, encontrar uma sessão persistida ativa e então
chamar o `POST /session/:id/load` ou `POST /session/:id/resume` ciente de
workspace do PR 1 da Fase 2b.

Se um workspace não primário confiável não tem sessões persistidas ativas, a
listagem mantém o comportamento anterior de cursor apenas ativo. Visualizações
de lista não primárias arquivadas, organizadas e agrupadas permanecem
rejeitadas porque as superfícies de archive/unarchive/delete e de organização
de sessões ainda são trabalho apenas primário/de fase posterior.

O trabalho da Fase 2b até agora não adiciona novas tags de capability, não
altera o esquema de `/capabilities`, não muda os tipos do SDK e não roteia
superfícies de ACP, voice, channel-worker, file, memory, MCP, settings,
branch/fork/cd/rewind, shell/model/language, export, archive, delete ou
organization para runtimes não primários.

## Decisões de Auditoria

- O PR de fundamentos não deve criar runtimes não primários nem relaxar
  nenhuma rota REST.
- Os `app.locals.boundWorkspace` e `app.locals.fsFactory` existentes permanecem
  como locals de compatibilidade apenas para o primário.
- O `routeFileSystemFactory` REST permanece distinto das factories de
  filesystem da bridge; não deve ser usado para representar limites de bridge
  não primários.
- Raízes de filesystem secundárias da IDE não devem ser promovidas em runtimes
  de workspace explícitos.
- O comportamento de parent-env de workspace único permanece compatível até
  que o modo multi-workspace real seja liberado.
- O limite seguro do PR 2 é o loop fechado de sessões ativas mais os metadados
  aditivos de capabilities/status. Se uma rota precisa de armazenamento
  persistido, estado de organização, configurações de workspace ou estado
  local de conexão ACP, ela permanece apenas primária ou posterior.
