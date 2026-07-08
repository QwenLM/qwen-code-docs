# Fundamentos da Fase 2a para Sessões Multi-Workspace

## Resumo

Este documento registra o contrato base da Fase 2a para a issue #6378 após
o PR da Fase 1 do `WorkspaceRegistry`. O lote de implementação atual combina
o acompanhamento da repetição de `--workspace` da Fase 1, as guardrails de
preparação da Fase 2a e o primeiro contrato interno de registry/runtime
necessário para os trabalhos subsequentes de sessões multi-workspace.

A Fase 2a permanece apenas para sessões. Ela não adiciona rotas no plural, um
`WorkspaceDaemonClient`, ACP/WebSocket qualificado por workspace, migração de
file, memory, MCP, settings, voice, channel-worker, env overlays, admissão de
total-session, capabilities `workspaces[]`, `multi_workspace_sessions`, route
dispatch ou construção de runtime não-primária neste lote base.

## Contrato Base

- `--workspace` é repetível na camada do parser de CLI para que o yargs preserve
  a entrada em array em vez de colapsá-la.
- O fast path do serve faz fallback para o parser completo quando valores de
  workspace repetidos estão presentes.
- Um array de workspace com um único item é tratado como o workspace primário e
  mantém o comportamento existente de workspace único.
- Múltiplos workspaces explícitos permanecem restritos por um gate e falham
  antes do boot do runtime.
- Entradas canônicas duplicadas de workspace falham explicitamente.
- Entradas aninhadas de workspace falham explicitamente.
- Entradas distintas e não aninhadas de múltiplos workspaces falham com o erro
  genérico de boot "multi-workspace serve is not enabled".
- O primeiro workspace explícito é o futuro workspace primário assim que o gate
  for removido; este lote base não expõe essa lista publicamente.

O contrato interno do `WorkspaceRuntime` agora carrega metadados estáveis para
trabalhos posteriores da Fase 2a:

- `workspaceId`: hash estável do cwd canônico do workspace.
- `workspaceCwd`: cwd canônico do workspace.
- `primary`: true para o runtime primário.
- `trusted`: metadados de confiança no boot; o fallback direto do
  `createServeApp` permanece false, a menos que o ambiente de produção passe um
  valor trusted explícito.
- `env`: apenas metadados. Este lote base registra o modo do processo pai e
  chaves de overlay vazias; não calcula env overlays locais do runtime.

O `WorkspaceRegistry` interno suporta busca exata por cwd, busca exata por id,
fallback primário de `resolveWorkspaceCwd(undefined)` e resolução de proprietário
de sessão ativa. A resolução de proprietário ativo verifica apenas os resumos da
bridge do runtime; ela não verifica armazenamento persistido, não cria filhos e
ainda não roteia nenhuma requisição. Proprietários ativos duplicados falham de
forma fechada (fail closed) como um resultado ambíguo.

O `createServeApp` pode aceitar um registry injetado para testes e montagem
futura, mas os módulos de rota ainda recebem apenas o runtime primário. Os
locals legados existentes `app.locals.boundWorkspace` e `app.locals.fsFactory`
permanecem como locals de compatibilidade apenas para o primário.

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

Rotas posteriores ou apenas primárias:

- `POST /session/:id/load` não-primário
- `POST /session/:id/resume` não-primário
- `GET /session/:id/export`
- `POST /sessions/delete`
- `POST /sessions/archive`
- `POST /sessions/unarchive`
- `PATCH /session/:id/organization`
- mutações de session-group
- mutações de sessão de branch, fork, cd, rewind, shell, model e language
- `POST /permission/:requestId` fora de sessão
- `/acp`

Rotas de leitura ativas adicionais podem ser roteadas por proprietário em uma
fatia posterior da Fase 2a somente após os testes provarem que elas dependem
exclusivamente da bridge ativa proprietária.

## Requisitos Posteriores da Fase 2a

- Mantenha os erros de scan (scan misses) como `404 session_not_found`; nunca
  faça fallback para o primário.
- Falhe de forma fechada (fail closed) se mais de um runtime reportar o mesmo
  id de sessão ativa.
- Mantenha a listagem de sessões não primárias apenas como ativas (live-only), a
  menos que as entradas persistidas sejam explicitamente marcadas como não
  retomáveis.
- Adicione env overlays locais do runtime antes do spawn de filhos não primários.
- Adicione `maxTotalSessions` no ponto de criação fresca da bridge para que o
  REST e o `/acp` primário não possam contorná-lo, enquanto o attach ainda
  contorna a admissão.
- Publique `workspaces[]`, limites totais e `multi_workspace_sessions` apenas no
  PR final de remoção do gate.
- Atualize os tipos de capability do SDK quando o schema de capacidades aditivas
  for lançado, mas não adicione um cliente de workspace na Fase 2a.

## Decisões de Auditoria

- O PR base não deve criar runtimes não primários nem relaxar nenhuma rota REST.
- Os `app.locals.boundWorkspace` e `app.locals.fsFactory` existentes permanecem
  como locals de compatibilidade apenas para o primário.
- O `routeFileSystemFactory` REST permanece distinto das factories de filesystem
  da bridge; não deve ser usado para representar limites de bridge não primários.
- Raízes de filesystem secundárias da IDE não devem ser promovidas em runtimes
  de workspace explícitos.
- O comportamento de parent-env de workspace único permanece compatível até que
  o modo multi-workspace real seja liberado.