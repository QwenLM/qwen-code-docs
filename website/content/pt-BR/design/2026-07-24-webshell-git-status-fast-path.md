# Exibição rápida do chip de git no Web Shell: branch primeiro + cache/push de status

Data: 2026-07-24
Status: a confirmar

## Contexto e problema

Ao criar uma nova sessão no Web Shell, o chip de git na barra de ferramentas do
composer demora a aparecer. Causa raiz (confirmada linha por linha):

1. **No daemon, o branch é atrasado pelo subprocesso de `git status`** — em
   `WorkspaceGitState.getStatus()`
   (`packages/cli/src/serve/workspace-git-state.ts`) o branch tem um fast path
   de milissegundos (`resolveBranchName` lê o arquivo `HEAD` + watcher de
   reflog), mas a resposta HTTP precisa esperar
   `getGitWorkingTreeStatus()` terminar — cada requisição faz spawn síncrono de
   `git status --porcelain=v1 --branch -z` (`gitDiff.ts` runGit, timeout de 5s,
   zero cache).
2. **No front-end, a renderização do chip é bloqueada pelo status completo** —
   ao criar uma sessão nova, o texto do chip só aceita
   `selectedWorkspaceGitStatus?.branch` (App.tsx 7860–7871), que espera toda a
   ida e volta HTTP + git status (o effect em App.tsx 1480–1520) antes do
   setState.
3. **A mesma rota é chamada duas vezes em paralelo** — a busca de metadata do
   `DaemonSessionProvider` (`DaemonSessionProvider.tsx:1320`, que usa apenas
   `.branch`) e o effect de git-status do App.tsx disparam quase ao mesmo tempo
   `GET /workspaces/:ws/git`, e o daemon faz spawn de dois subprocessos
   idênticos.
4. Bloqueio serial: `activeWorkspaceCwd` depende de `GET /capabilities`
   terminar primeiro.

## Objetivos e não objetivos

Objetivos:

- Ao criar sessão / na primeira tela, o chip de git **aparece imediatamente**
  com o texto do branch (um RTT HTTP local, em milissegundos); os contadores
  dirty/ahead/behind/stash são completados assim que o daemon terminar o
  cálculo (requisição fresh com `wait: true`; com sessão ativa há também push
  em tempo real via SSE).
- Eliminar subprocessos duplicados de `git status` (deduplicação por
  concorrência + stale-while-revalidate).
- Sem regressão: chip de workspace da sidebar (que precisa dos contadores),
  chip de sessão de worktree, detached HEAD, workspace não git, degradação em
  falha de git.

Não objetivos:

- O caminho `?cwd=` de worktree não introduz watcher/cache (mantém o estado
  atual: cálculo direto, evitando vazar um fs watcher por worktree). A
  latência do chip de worktree não muda.
- Sem preaquecimento no boot do daemon (o front-end requisita logo após
  capabilities; o ganho do preaquecimento é pequeno).
- Não alterar a semântica existente de `git_branch_changed`.

## Visão geral da solução

Mudanças em três camadas: cache no daemon + refresh em background + push via
SSE (P0), resposta em duas fases (P1), front-end consumindo SSE e mantendo o
caminho lento para os chamadores que precisam dele (P2, reavaliado — ver
abaixo).

### P0+P1: daemon — cache, deduplicação, refresh em background e push via SSE em `WorkspaceGitState`

Extensão de `WorkspaceGitEntry`:

```ts
interface WorkspaceGitEntry {
  branch: string | undefined; // watcher mantém fresco (atual)
  dispose: () => void; // atual
  status?: GitWorkingTreeStatus; // último working-tree summary bruto calculado
  statusComputedAt?: number; // epoch ms
  statusPromise?: Promise<void>; // deduplicação de in-flight
  disposed?: boolean; // proíbe publish após dispose
}
```

A semântica de `getStatus(cwd, bridge, opts?: { wait?: boolean })` passa a ser:

- **Padrão (fast path)**: garante que o entry existe (branch responde em
  segundos); dispara um refresh em background via stale-while-revalidate (ver
  abaixo); **retorna imediatamente** o último status em cache (materialize:
  overlay `entry.branch ?? status.branch`, formato v2 + `computedAt`); se nunca
  foi calculado, retorna apenas branch `{ v, workspaceCwd, branch }` (sem
  `computedAt`; o front-end usa isso para distinguir "não calculado" de
  "clean").
- **`wait: true`**: espera (ou inicia e espera, reutilizando in-flight) um
  cálculo fresco e retorna o status completo. Falha no cálculo degrada para
  apenas branch (semântica atual).

Refresh em background `refreshStatus(entry)`:

- Reutilização in-flight: se `statusPromise` existe, retorna-o diretamente.
- Throttle: se faz < 2s desde o último início, pula (evita fila serial de
  subprocessos git em tempestade de focus).
- Cálculo bem-sucedido com diferença em relação aos campos enriched do cache →
  atualiza o cache + envia o status completo materializado via
  `bridge.publishWorkspaceEvent({ type: 'git_status_changed', data })` (data é
  `DaemonWorkspaceGitStatus`, incluindo workspaceCwd). O primeiro cálculo
  (cache vazio) é tratado como tendo diferença e sempre envia — este é o canal
  que completa os contadores do chip em cold start.
- Sem diferença → atualiza apenas o cache, sem push (evita setState/re-render
  no front-end a cada polling de 30s).
- Falha no cálculo / diretório não git → mantém o cache antigo, sem push.
- Entry já disposed → sem push.

**Sem TTL**. last-known + refresh em background disparado a cada GET +
correção via SSE já bastam; o throttle de 2s assume o papel de "TTL contra
explosão". Chamadores com `wait: true` sempre recebem um cálculo fresco
(reutilização in-flight).

Rotas (`packages/cli/src/serve/routes/workspace-git.ts`):

- `/workspace/git` e `/workspaces/:workspace/git` fazem parse de `?wait=1` e
  repassam para `getStatus`. Padrão é fast.
- O ramo `?cwd=` de worktree mantém o estado atual (direto
  `getGitWorkingTreeStatus`, sem entrar no cache).

### SDK (`packages/sdk-typescript`)

- `events.ts`: `DAEMON_KNOWN_EVENT_TYPE_VALUES` ganha `'git_status_changed'`
  (logo após `'git_branch_changed'`). SDKs antigos descartam silenciosamente
  via `asKnownDaemonEvent` — compatível com versões anteriores, sem necessidade
  de bump de protocolo (mesmo padrão de `followup_suggestion`).
- `ui/normalizer.ts`: `case 'git_status_changed': return [];` (tratado pelos
  session mappers, igual a `git_branch_changed`, sem entrar no fluxo de
  normalização de UI).
- A assinatura de `DaemonClient.workspaceGit` passa a ser um objeto de opções:
  `workspaceGit(opts?: { cwd?: string; wait?: boolean })`, montando a query
  (`cwd` e `wait=1` podem ser combinados). Migrar todos os 4 pontos de chamada
  (App.tsx, WorkspaceSection, DaemonSessionProvider ×2) e os testes unitários
  do SDK.

### webui (`packages/webui`)

- `session/types.ts`: `DaemonConnectionState` ganha
  `gitStatus?: DaemonWorkspaceGitStatus` (apenas o status completo do
  workspace atual, mantido via SSE).
- `session/mappers.ts`: `updateConnectionFromDaemonEvent` ganha
  `case 'git_status_changed'` — se `data.workspaceCwd` não bater com
  `current.workspaceCwd`, ignora (espelhando o guard de `git_branch_changed`);
  caso contrário, `setConnection({ ...current, gitStatus: data })`.

### web-shell (`packages/web-shell`)

- Effect de git-status do `App.tsx`: o composer usa
  **stale-while-revalidate no cliente** — cada disparo faz duas requisições em
  paralelo (exceto sessões de worktree, ver abaixo):
  1. `workspaceGit({ cwd: sessionWorktree?.path })` (fast): last-known responde
     em segundos, renderiza imediatamente (cache frio apenas com branch);
  2. `workspaceGit({ wait: true })` (fresh): o daemon retorna o status completo
     assim que terminar o cálculo em background, completando os contadores. As
     duas requisições compartilham o mesmo cálculo no daemon (deduplicação
     in-flight), sem aumentar o número de subprocessos git.
- **Por que a requisição fresh precisa existir (descoberto em auditoria
  reversa)**: o SSE `git_status_changed` passa pelo fluxo de eventos por sessão
  (`GET /session/:id/events`); **o estado de sessão nova (deferred connect,
  sem sessionId) não tem assinatura SSE** — disparando apenas o GET fast, os
  contadores só seriam completados no polling de 30s ou no focus. A requisição
  fresh não depende de sessão existir, garantindo "branch imediato, contadores
  assim que calculados" em todos os estados de sessão. (`git_branch_changed`
  já tem hoje o mesmo ponto cego sem sessão; não é regressão.)
- O `App.tsx` também mantém o effect de sincronização via SSE: quando
  `connection.gitStatus` muda, `workspaceCwd` bate e não há `sessionWorktree`,
  escreve em `selectedWorkspaceGitStatus` — cobre o push em tempo real **com
  sessão ativa** entre dois pollings (refresh em background disparado por
  outro cliente/CLI chegando via push).
- Sessões de worktree disparam apenas a requisição fast: o caminho `?cwd=` já
  contorna o cache e calcula diretamente (fast e wait são equivalentes),
  comportamento inalterado.
- `sidebar/WorkspaceSection.tsx`: `workspaceGit({ wait: true })` — o chip da
  sidebar precisa dos contadores e não tem canal duplo SSE/fresh; mantém a
  semântica de bloqueio (comportamento atual inalterado; workspaces inativos
  não têm canal SSE).

### Reavaliação do P2 (corte por valor)

O P2 original (deduplicação no front-end: a primeira busca do provider
armazena o status completo para reuso pelo App) foi **rebaixado para não
fazer**: a deduplicação in-flight no daemon do P0 já elimina subprocessos
duplicados de `git status` (a substância do problema original); o que resta é
apenas uma ida e volta HTTP local de milissegundos. Guardar o status completo
no provider e deixar o App reutilizá-lo introduziria acoplamento entre camadas
(protocolo provider→App de valor inicial), com ganho praticamente nulo. As
duas chamadas `workspaceGit()` do provider só leem `.branch` e podem usar o
fast path padrão; zero mudanças.

## Compatibilidade

- O formato da resposta das rotas não muda (v2; os campos enriched já são
  opcionais); a nova query `?wait=1` é opcional.
- Mudança de semântica do fast path padrão: chamadores podem receber
  last-known (cache antigo) em vez de cálculo fresco. Todos os chamadores
  existentes foram conferidos um a um:
  - `DaemonSessionProvider` (×2): só lê `.branch` — branch sempre fresco
    (watcher), sem impacto.
  - Chip do composer no App.tsx: exatamente o alvo deste design.
  - WorkspaceSection: alterado explicitamente para `wait: true`, semântica
    inalterada.
- O novo evento SSE é descartado silenciosamente por clientes antigos
  (mecanismo de known-list do SDK).
- `git_status_changed` é publicado apenas no bus SSE da sessão daquele
  workspace (mecanismo existente `publishWorkspaceEvent`, incluindo isolamento
  multi-workspace).

## Riscos e mitigações

| Risco                                                                  | Mitigação                                                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Chip mostra o branch primeiro e os contadores aparecem depois, oscilando a largura da barra de ferramentas | Já existe cópia oculta de medição (toolbar-measure do ChatEditor) que trata o re-measure; aceita-se leve deslocamento |
| Resposta apenas com branch ser mal interpretada como "clean"           | Resposta apenas com branch não carrega `computedAt`; a lógica existente do GitBranchIndicator não mostra "clean" quando `computedAt` está ausente |
| Status em cache inconsistente com o branch do watcher                  | No materialize, overlay `entry.branch ?? status.branch` (lógica atual preservada)                          |
| Vazamento do refresh em background (publish após dispose)              | Guard pelo flag `disposed`                                                                                  |
| Tempestade de focus disparando spawns seriais de git                   | Throttle de 2s + reutilização in-flight                                                                     |

## Plano de testes

Testes unitários:

- `workspace-git-state.test.ts` (estendido): fast path retorna last-known
  imediatamente; cache frio retorna apenas branch sem `computedAt`; refresh em
  background publica `git_status_changed` apenas com diferença; primeiro
  cálculo sempre publica; getStatus concorrente dispara apenas um
  `getGitWorkingTreeStatus`; throttle de 2s; `wait: true` espera o cálculo
  fresco; falha no cálculo mantém o cache antigo sem publicar; sem publish após
  dispose.
- `routes/workspace-git.test.ts` (estendido): repasse de `?wait=1`; caminho
  `?cwd=` de worktree não entra no cache (mantém cálculo direto).
- `DaemonClient.test.ts` do SDK: montagem da query do objeto de opções (cwd /
  wait / combinação).
- `mappers.test.ts` do webui: dois ramos de `git_status_changed` com
  workspaceCwd combinando / não combinando.

E2E (`.qwen/e2e-tests/2026-07-24-git-chip-fast-branch.md`, a acrescentar na
fase de validação): daemon real + web shell, sessão nova em workspace grande —
o chip (branch) aparece imediatamente após o editor ficar pronto, os
contadores são completados em seguida; o chip da sidebar mantém o
comportamento; focus/polling de 30s continua atualizando; chip de sessão de
worktree inalterado.

## Alternativas rejeitadas

- **Cache com TTL (sem refresh em background/SSE)**: só acelera requisições
  repetidas; o cold start ainda precisa esperar o git status — não resolve a
  queixa principal de "chip lento em sessão nova".
- **Preaquecimento do daemon após capabilities**: o primeiro GET ocorre quase
  junto com o preaquecimento; após deduplicação in-flight o ganho ≈ 0.
- **Apenas deduplicar/fundir requisições no front-end**: não elimina a espera
  pelo subprocesso de git status; trata só o sintoma.
