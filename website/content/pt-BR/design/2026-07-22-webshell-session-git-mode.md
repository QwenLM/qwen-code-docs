# Seleção de modo Git para nova sessão no Web Shell

## Contexto

No desenvolvimento diário, quando um usuário cria uma nova sessão, existem três
fluxos de trabalho Git:

1. **Branch atual** — desenvolver diretamente no branch atual (comportamento
   padrão)
2. **Isolamento por worktree** — criar um worktree + branch independentes, sem
   afetar o diretório principal
3. **Novo branch** — criar e alternar para um novo branch no mesmo diretório de
   trabalho

Os cenários 1 e 2 já têm suporte completo (o cenário 2, ver
[2026-07-19-webshell-worktree-sessions.md](./2026-07-19-webshell-worktree-sessions.md)
e
[2026-07-20-worktree-empty-state-toggle.md](./2026-07-20-worktree-empty-state-toggle.md)).
O cenário 3 está ausente — quando o usuário quer "abrir um novo branch para
esta tarefa", só pode executar manualmente `git checkout -b` antes de criar a
sessão, ou é forçado a usar worktree (introduzindo isolamento de diretório
desnecessário).

## Objetivos

- Fornecer no estado vazio do chat um **seletor de modo Git** unificado,
  cobrindo os três cenários.
- Modo "novo branch": o daemon executa automaticamente `git checkout -b` no
  `POST /session`, e a sessão inicia diretamente no novo branch.
- Reutilizar a cadeia existente de criação de worktree, sem alterar o
  comportamento do worktree.
- Compatibilidade retroativa: sem novos parâmetros, o comportamento permanece
  exatamente o mesmo.

## Não objetivos

- Sem suporte para checkout de branch existente (v1 apenas cria; a alternância
  para branch existente pode ser adicionada incrementalmente depois).
- Sem retorno automático ao branch original ao término da sessão (evita perder
  o estado do usuário).
- Sem UI de merge-back.
- Sem alteração do comportamento das ferramentas `enter_worktree` /
  `exit_worktree`.

## Design

### UI do estado vazio: git chip dentro do composer

O seletor de modo não é um bloco independente, mas **embutido na barra de
ferramentas inferior do composer** — reutilizando a posição do git chip
existente (abaixo da caixa de entrada, à esquerda do botão de envio). O chip
mostra por padrão o branch atual `⎇ main`; um clique abre um popover para
escolher o modo:

```text
┌─ composer ───────────────────────────────────────────┐
│  Descreva sua tarefa…                                │
│                                                      │
│  📎  @  🎙              [⎇ main ▾]  [Enviar]         │
└──────────────────────────────────────────────────────┘
                              │ clique
                              ▼
              ┌─ popover de modo Git ─────────────────────┐
              │  ● Branch atual   direto no main          │
              │  ○ Novo branch    criado a partir do main │
              │    [campo de nome de branch — expande ao  │
              │     selecionar]                           │
              │  ○ Worktree       cópia independente,     │
              │                   paralela                │
              │  ───────────────────────────────────────  │
              │  $ git checkout -b feat/x ← main          │
              │                          [Criar branch]   │
              └───────────────────────────────────────────┘
```

- **Branch atual** (padrão): o chip mostra `⎇ main` (verde), equivalente ao
  comportamento existente. Após a seleção, o popover fecha automaticamente.
- **Novo branch**: o popover expande o campo de nome de branch + aviso de
  concorrência, com validação em tempo real (nome de branch git válido, sem
  conflito com branches existentes). Após confirmar, o chip vira
  `⎇ → feat/xxx` (laranja), com ✕ para restaurar o padrão com um clique.
- **Worktree isolado**: mostra uma prévia do slug gerado automaticamente. Após
  confirmar, o chip vira `⎇ worktree isolado` (roxo), com ✕ para restaurar o
  padrão com um clique.

A prévia em tempo real na parte inferior do popover mostra o comando git que
será executado (`git checkout -b …` / `git worktree add …`), deixando claro ao
usuário o que vai acontecer.

Vantagens do esquema de chip: não ocupa espaço vertical da área de boas-vindas;
a entrada está dentro do composer, onde a atenção do usuário está; no estado
não vazio (sessão existente) o chip continua visível, com semântica
consistente.

As condições de visibilidade são as mesmas do interruptor de worktree
existente: workspace confiável + é um repositório git. Quando não atendidas, o
chip se degrada para um indicador de branch somente leitura (comportamento
existente).

#### Máquina de estados

Estender `pendingWorktreeRef` / `worktreePending` para uma intenção pendente
unificada:

```typescript
type SessionGitIntent =
  | { mode: 'current' }
  | { mode: 'branch'; name: string }
  | { mode: 'worktree'; slug?: string };
```

- Selecionar "branch atual" → `{ mode: 'current' }` (equivalente a
  `undefined`, nenhum parâmetro enviado).
- Selecionar "novo branch" → `{ mode: 'branch', name }`.
- Selecionar "worktree" → `{ mode: 'worktree', slug? }` (reutiliza a lógica
  existente).
- Enviar a primeira mensagem → `ensureSessionForPrompt` carrega os parâmetros
  correspondentes conforme a intenção.
- Após criação bem-sucedida, limpar a intenção; em falha, retê-la para retry.

### Mudanças de API

#### `CreateSessionRequest` (SDK)

```typescript
export interface CreateSessionRequest {
  // ... existing fields ...
  worktree?: { slug?: string };
  /**
   * Create a new git branch and check it out before starting the
   * session. The session runs in the same working directory but on
   * the new branch. Mutually exclusive with `worktree`.
   */
  branch?: { name: string };
}
```

`branch` e `worktree` são mutuamente exclusivos; passar ambos retorna 400.

#### Respostas `DaemonSession` / `DaemonSessionSummary`

```typescript
export interface DaemonBranchInfo {
  name: string; // nome do novo branch criado
  baseBranch: string; // branch base no momento da criação
}

export interface DaemonSession {
  // ... existing fields ...
  worktree?: DaemonWorktreeInfo;
  branch?: DaemonBranchInfo;
}
```

#### Tratamento da rota `POST /session` (`routes/session.ts`)

Antes da lógica existente de tratamento de worktree, adicionar o tratamento de
branch:

```text
1. Validar a exclusividade mútua de branch / worktree
2. Validar que branch.name é um nome de branch git válido
3. Verificar que o nome do branch não conflita com um branch existente (git rev-parse --verify)
4. Detectar árvore suja (git status --porcelain); se houver alterações, 409 branch_dirty_tree
5. Registrar baseBranch = branch atual (git rev-parse --abbrev-ref HEAD)
6. git checkout -b <name>
7. branchMeta = { name, baseBranch }
8. Forçar sessionScope = 'thread'
9. spawnOrAttach normal (cwd inalterado)
10. Rollback em falha: git checkout <baseBranch> && git branch -D <name>
```

Não é necessário `changeSessionCwd` (o diretório de trabalho não muda) nem
marker de worktree.

#### Códigos de erro

| Código de erro                   | Significado                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `branch_and_worktree_conflict`   | `branch` e `worktree` foram passados ao mesmo tempo                             |
| `invalid_branch`                 | o campo `branch` não é um objeto (deve ser `{"name":"..."}`)                    |
| `branch_invalid_name`            | nome de branch inválido                                                         |
| `branch_session_conflict`        | o workspace já tem uma sessão de branch, ou o checkout compartilhado já tem outra sessão ativa |
| `branch_init_failed`             | falha ao inicializar o serviço git                                              |
| `branch_not_git_repo`            | o workspace não é um repositório git                                            |
| `branch_already_exists`          | o nome de branch já existe                                                      |
| `branch_status_failed`           | falha ao verificar o estado do diretório de trabalho                            |
| `branch_dirty_tree`              | o diretório de trabalho tem alterações não cometidas; faça commit ou stash antes |
| `branch_checkout_failed`         | falha em `git checkout -b` (outro motivo)                                       |

### Cadeia de passagem de parâmetros do frontend

```text
App.tsx (estado gitIntent)
  → sessionPreparation.ts createAndAttachSessionForPrompt({ branch })
    → actions.ts createSession({ branch })
      → DaemonClient.createOrAttachSession({ branch })
        → POST /session { branch: { name } }
```

Totalmente simétrica à cadeia do worktree, com passagem de `branch` adicionada
em cada camada.

### Exibição na barra lateral

- Sessão de worktree: badge existente `GitForkIcon`, inalterado.
- Sessão de branch: exibir badge `GitBranchIcon` + nome do branch.
- Sessão comum: sem badge, inalterado.

### Limite de concorrência

Sessões de "novo branch" do mesmo workspace mudam o HEAD do diretório de
trabalho compartilhado; múltiplas sessões de branch conflitam entre si.
Estratégia de limitação:

- **Servidor**: quando `POST /session` traz `branch`, verificar se o mesmo
  workspace já tem uma sessão de branch ativa (pela lista de sessões da bridge
  + `branchMeta`). Se tiver, retornar 409 `branch_session_conflict`.
- **Frontend**: ao selecionar "novo branch" no estado vazio, se já houver uma
  sessão de branch ativa, exibir um aviso e desabilitar.

Sessões de worktree não estão sujeitas a esse limite (cada uma tem seu próprio
diretório).

### Alterações de arquivos

| Arquivo                                                              | Alteração                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`                 | campo `branch` adicionado a `CreateSessionRequest`                        |
| `packages/sdk-typescript/src/daemon/types.ts`                        | `DaemonBranchInfo`, `DaemonSession.branch`, `DaemonSessionSummary.branch` |
| `packages/cli/src/serve/routes/session.ts`                           | lógica de criação de branch em `POST /session` + rollback                 |
| `packages/webui/src/daemon/session/actions.ts`                       | `createSession` repassa `branch`                                          |
| `packages/webui/src/daemon/session/types.ts`                         | assinatura de `createSession` ganha `branch`                              |
| `packages/web-shell/client/App.tsx`                                  | máquina de estados `SessionGitIntent`, UI do seletor de modo, verificação de concorrência |
| `packages/web-shell/client/App.module.css`                           | estilos do seletor                                                        |
| `packages/web-shell/client/utils/sessionPreparation.ts`              | repasse de `branch`                                                       |
| `packages/web-shell/client/i18n.tsx`                                 | novas chaves i18n (en/zh)                                                 |
| `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`   | badge de sessão de branch                                                 |

### i18n

| Chave                            | EN                                                     | ZH                                       |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `gitMode.current`                | `Current branch`                                       | `当前分支`                               |
| `gitMode.branch`                 | `New branch`                                           | `新建分支`                               |
| `gitMode.worktree`               | `Worktree`                                             | `Worktree 隔离`                          |
| `gitMode.branch.placeholder`     | `Branch name`                                          | `分支名`                                 |
| `gitMode.branch.hint`            | `Switches the working directory to a new branch`       | `在工作目录中切换到新分支`               |
| `gitMode.branch.conflictWarning` | `Only one branch session per workspace at a time`      | `同一 workspace 同时只能有一个分支会话`  |
| `gitMode.branch.invalidName`     | `Invalid branch name`                                  | `分支名不合法`                           |
| `gitMode.branch.exists`          | `Branch already exists`                                | `分支已存在`                             |
| `gitMode.branch.dirtyTree`       | `Uncommitted changes detected. Commit or stash first.` | `检测到未提交改动，请先 commit 或 stash` |

## Questões decididas

1. **Valor padrão do nome do branch**: sem geração automática; o usuário
   digita. Campo vazio + sugestão de placeholder (por exemplo,
   `feat/my-feature`), reduzindo predefinições.
2. **Árvore de trabalho suja**: o servidor detecta o estado sujo antes de
   `git checkout -b` (`git status --porcelain`). Se houver alterações não
   cometidas, retorna 409 `branch_dirty_tree`, e o frontend avisa o usuário
   para fazer commit ou stash antes de criar a sessão de branch. Sem detecção
   prévia na camada de UI (evita divergência do comportamento real do git); a
   decisão é unificada no servidor.
3. **Restauração de sessão (resume)**: nenhum sidecar é necessário. O worktree
   precisa de sidecar porque o diretório de trabalho é separado do repositório
   principal; no resume é preciso saber o caminho do worktree. O diretório de
   trabalho da sessão de branch é o diretório original; `git branch` informa o
   branch atual, sem necessidade de registro adicional. Observação:
   `DaemonSessionSummary.branch` atualmente é mantido apenas em memória
   (mapeamento da bridge) e se perde após reinício do daemon, então o badge da
   barra lateral e o guarda de concorrência não persistem entre reinícios; a
   persistência é trabalho posterior.
