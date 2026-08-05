# Interruptor de isolamento de worktree no estado vazio do Web Shell

## Contexto

Sessões isoladas por worktree (ver
[2026-07-19-webshell-worktree-sessions.md](./2026-07-19-webshell-worktree-sessions.md))
têm atualmente como única entrada o **menu dropdown da cápsula de branch git**
no cabeçalho do workspace na barra lateral (`WorkspaceSection.tsx`), e exigem
que três condições sejam atendidas simultaneamente para serem renderizadas:
`onOpenGitDiff`, `workspace.trusted` e `gitStatus?.branch`. É muito difícil
para o usuário descobrir que um git pill é clicável; a funcionalidade está
oculta demais.

O Web Shell não tem uma "página independente de criação de sessão" — clicar em
nova sessão apresenta o estado vazio do chat (WelcomeHeader + caixa de
entrada), que é de fato a página de criação de sessão. O estado vazio já tem a
UI pronta de badge de worktree pendente (`worktreeWelcomeBadge` em `App.tsx`) e
a máquina de estados pendente completa (`pendingWorktreeRef` /
`worktreePending`); a sessão só é realmente criada ao enviar a primeira
mensagem (criação lazy), então o "interruptor" apenas define uma intenção
pendente.

## Objetivos

- Fornecer um interruptor visível de isolamento de worktree no estado vazio do
  chat; ao clicar, reutilizar a máquina de estados pendente existente e a
  cadeia de criação lazy.
- Quando ligado, exibir o badge pendente existente e fornecer uma via de
  cancelamento.
- Manter inalterada a entrada do menu do git pill na barra lateral (entrada de
  atalho por workspace).

## Não objetivos

- Não alterar o SDK, o roteamento do daemon nem o `GitWorktreeService` — a
  cadeia de criação é totalmente reutilizada.
- Não alterar a semântica existente de "a intenção segue o workspace": a
  intenção pendente sempre se aplica ao workspace resolvido na próxima criação
  de sessão (`lockedWorkspaceCwd ?? selectedWorkspaceCwd ?? primary`),
  consistente com o estado atual da entrada da barra lateral.
- Não tratar o aviso de falha de "pendente ligado e depois alternado para um
  workspace não git" (o estado atual já produz erro, fora do escopo desta
  iteração).

## Design

### Visibilidade do interruptor (eligibility)

Somente quando todas as condições a seguir forem atendidas o estado vazio
exibe o interruptor:

| Condição                                     | Sinal                                                           | Razão                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Estado vazio do chat                          | `welcomeHeader` é renderizado apenas quando `isChatEmptyState`  | Atendida naturalmente, sem verificação adicional                                          |
| Workspace atual é confiável                   | `workspaces.find(e => e.cwd === activeWorkspaceCwd)?.trusted`   | Consistente com a entrada da barra lateral: workspace não confiável não sofre mudanças git |
| Workspace atual é um repositório git          | `selectedWorkspaceGitStatus?.branch`                            | O daemon falha de forma rígida para repositórios não git (`worktree_not_git_repo`); ocultar antecipadamente |

`activeWorkspaceCwd` reutiliza o memo existente
(`connection.sessionId ? connection.workspaceCwd : (locked ?? selected ?? primary)`),
e `selectedWorkspaceGitStatus` reutiliza o effect de busca existente. Ambos são
estados existentes, sem novas requisições de rede. Antes que o git status
termine de carregar, o interruptor não é exibido, consistente com o
comportamento de gate por `gitStatus?.branch` da barra lateral.

### Interação

- **Estado desligado**: na posição do badge, renderizar um botão ghost
  discreto (ícone de fork + texto de `worktree.welcomeTitle`). Clique →
  `pendingWorktreeRef.current = {}` + `setWorktreePending(true)`.
- **Estado ligado**: renderizar o `worktreeWelcomeBadge` existente (ícone +
  título + descrição), com um botão X de cancelamento no canto superior
  direito (`aria-label` usando uma nova chave i18n). Clique →
  `pendingWorktreeRef.current = undefined` + `setWorktreePending(false)`.
- Enviar a primeira mensagem → `ensureSessionForPrompt` carrega `worktree: {}`
  conforme a lógica existente; após sucesso, limpa automaticamente o pendente;
  em falha, retém o badge para retry (estado atual inalterado).
- Clicar em "nova sessão" na barra lateral, carregar sessões existentes e
  outros caminhos existentes mantêm inalterada a lógica de limpeza do pendente.

### Alterações de arquivos

| Arquivo                                                             | Alteração                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/web-shell/client/App.tsx`                                 | memo de eligibility, handlers de ligar/cancelar, renderização do interruptor/badge no memo de welcomeHeader |
| `packages/web-shell/client/App.module.css`                          | estilos do botão ghost do interruptor, estilos do botão de cancelamento do badge |
| `packages/web-shell/client/i18n.tsx`                                | nova `worktree.cancel` (en/zh)                                             |
| `packages/web-shell/client/App.test.tsx`                            | testes unitários: gate de visibilidade, ligar/cancelar, envio com `worktree: {}` |
| `packages/web-shell/client/e2e/utils/mockDaemon.ts`                 | completar a capability `workspaces` (incluindo `trusted`) e a rota `/workspaces/:cwd/git` |
| `packages/web-shell/client/e2e/web-shell.worktree-toggle.spec.ts`   | novo E2E Playwright: interruptor aparece/liga/cancela, corpo da requisição de envio contém `worktree` |

## Questões em aberto

Nenhuma.
