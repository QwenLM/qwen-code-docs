# Design de Capacidade Universal do Worktree

## Declaração do Problema

Atualmente, o qwen-code possui apenas uma implementação interna de worktree (`GitWorktreeService`) voltada para o cenário de comparação multi-modelo do Arena. Os usuários não conseguem usar worktree para isolar o trabalho em sessões comuns, e o AgentTool também não suporta a criação de ambientes worktree isolados para subagentes.

O objetivo é tornar o worktree uma capacidade universal, suportando isolamento em nível de sessão do usuário e em nível de agente, garantindo ao mesmo tempo que a experiência funcional existente do Arena permaneça completamente inalterada.

## Comparação do Estado Atual

| Funcionalidade                         | qwen-code       | claude-code | Fase     |
| -------------------------------------- | --------------- | ----------- | -------- |
| Ferramenta `EnterWorktree`             | ✅ (Fase A)     | ✅          | —        |
| Ferramenta `ExitWorktree`              | ✅ (Fase A)     | ✅          | —        |
| AgentTool `isolation: 'worktree'`      | ✅ (Fase B)     | ✅          | —        |
| Limpeza automática de worktrees expirados | ✅ (Fase B)  | ✅          | —        |
| Persistência e restauração do estado da sessão worktree | ❌ | ✅          | Fase C   |
| Setup pós-criação (configuração de hooks) | ❌           | ✅          | Fase C   |
| Exibição do estado do worktree na StatusLine | ❌         | ✅          | Fase C   |
| WorktreeExitDialog (aviso de saída)    | ❌              | ✅          | Fase C   |
| Sinalizador CLI `--worktree`           | ✅ (Fase D)     | ✅          | —        |
| Diretórios de link simbólico (node_modules, etc.) | ✅ (Fase D) | ✅        | —        |
| Referência de PR (`--worktree=#123`)   | ✅ (Fase D)     | ✅          | —        |
| sparse checkout                        | ❌              | ✅          | Futuro   |
| Integração com tmux                    | ❌              | ✅          | Futuro   |
| Isolamento de worktree multi-modelo do Arena | ✅ (exclusivo qwen) | ❌      | —        |
| Sobrescrita de estado sujo (stash + copy) | ✅           | ✅          | —        |
| Rastreamento de commit baseline        | ✅ (exclusivo qwen) | ❌      | —        |

## Princípios de Design

**Worktree é uma capacidade universal, Arena é sua aplicação de nível superior.**

- Camada de worktree universal: Ferramentas `EnterWorktree`/`ExitWorktree`, parâmetro `isolation` do AgentTool, gerenciamento de estado da sessão, limpeza automática
- Camada Arena: Agendamento paralelo multi-modelo, caminho personalizado `worktreeBaseDir`, criação em lote e comparação de diff, continuam usando a lógica existente de `GitWorktreeService.setupWorktrees()`, sem serem afetados por alterações na camada universal

O `isolation: 'worktree'` do AgentTool segue apenas o caminho universal. O Arena não cria worktrees através deste parâmetro internamente; os dois caminhos são independentes.

## Caminhos e Configuração

### Caminho do Worktree Universal

Worktrees criados pela ferramenta `EnterWorktree` ou por `AgentTool isolation: 'worktree'` são armazenados fixamente em:

```
{raiz do repositório git}/.qwen/worktrees/{slug}
```

O caminho não é configurável. Regras de nomenclatura do slug:

- Worktree de sessão do usuário: Nome especificado pelo usuário, ou gerado automaticamente (formato: `{adjetivo}-{substantivo}-{4 aleatório}`)
- Worktree de agente: `agent-{7 hex aleatório}`

### Caminho do Worktree do Arena (existente, permanece inalterado)

O caminho do worktree do Arena é controlado por `agents.arena.worktreeBaseDir`, padrão `~/.qwen/arena` (`ArenaManager.ts:125`), completamente independente do caminho universal, sem alterações.

### Configurações Estendidas

| Item de Configuração                 | Tipo       | Propósito                                                                  | Fase    |
| ------------------------------------ | ---------- | -------------------------------------------------------------------------- | ------- |
| `ui.hideBuiltinWorktreeIndicator`    | `boolean`  | Oculta a linha `⎇ worktree-… (…)` embutida no Footer, deixando para o statusline customizado | Fase C  |
| `worktree.symlinkDirectories`        | `string[]` | Cria links simbólicos de diretórios especificados (ex.: `node_modules`) para o worktree, evitando desperdício de disco | Fase D  |
| `worktree.sparsePaths`               | `string[]` | Modo cone do git sparse-checkout, para grandes monorepos escrever apenas os caminhos especificados | Futuro  |

Fases A / B não adicionam novos itens de configuração.

## Design das Ferramentas

### EnterWorktree

**Condição de disparo:** O usuário diz explicitamente "start a worktree", "use a worktree", "create a worktree" ou termos semelhantes. Não deve ser acionado automaticamente quando o usuário diz "corrigir bug" ou "desenvolver funcionalidade".

**Schema de entrada:**

```
name?: string  // Opcional, formato do slug: letras/números/ponto/sublinhado/hífen, máximo 64 caracteres
```

**Comportamento:**

1. Verificar se não está atualmente em um worktree (evitar aninhamento)
2. Resolver para a raiz do repositório git (tratar casos em que já está em um subdiretório)
3. Chamar `GitWorktreeService` para criar o worktree, caminho `.qwen/worktrees/{slug}`
4. Escrever a sessão do worktree no `SessionService`
5. Alterar o diretório de trabalho para o caminho do worktree
6. Limpar o cache de arquivos

**Saída:** `worktreePath`, `worktreeBranch`, `message`

### ExitWorktree

**Condição de disparo:** O usuário diz "exit the worktree", "leave the worktree", "go back" ou termos semelhantes.

**Schema de entrada:**

```
action: 'keep' | 'remove'
discard_changes?: boolean  // Válido apenas quando action='remove'
```

**Salvaguardas de segurança:**

- Opera apenas no worktree criado por `EnterWorktree` nesta sessão
- Quando `action='remove'` e existem alterações não commitadas, recusa a execução (a menos que `discard_changes: true`)

**Comportamento:**

- `keep`: Limpa o estado do worktree na sessão, mantém o diretório e branch do worktree, restaura o diretório de trabalho original
- `remove`: Exclui o diretório do worktree, exclui o branch git correspondente, limpa o estado da sessão, restaura o diretório de trabalho original

**Saída:** `action`, `originalCwd`, `worktreePath`, `worktreeBranch`

## Formas de Ativação pelo Usuário

| Forma                  | Exemplo                                                          | Fase de Implementação |
| ---------------------- | ---------------------------------------------------------------- | --------------------- |
| Solicitação explícita na sessão | O usuário diz "comece a trabalhar em um worktree" → Modelo chama EnterWorktree | Fase A                |
| Isolamento de Agente   | Modelo define `isolation: 'worktree'` para um subagente          | Fase B                |
| Sinalizador CLI        | `qwen --worktree my-feature`                                     | Fase D                |

Sem comandos de barra. A ativação do worktree na sessão depende de menção explícita pelo usuário; `isolation: 'worktree'` é o cenário onde o modelo decide autonomamente.

## Plano de Implementação por Fase

### Fase A: Ferramentas Principais (Worktree em Nível de Sessão do Usuário)

**Objetivo:** Usuário consegue entrar/sair de um worktree na sessão.

**Funcionalidades a implementar:**

- Ferramenta `EnterWorktree`: Criar worktree, alterar diretório de trabalho, registrar estado da sessão
- Ferramenta `ExitWorktree`: Duas formas de saída (keep / remove), salvaguardas de segurança
- Extensão `GitWorktreeService`: Novos métodos `createUserWorktree()` / `removeUserWorktree()` voltados para sessão de usuário único, reutilizando a lógica git existente, sem alterar as interfaces de lote usadas pelo Arena
- Extensão `SessionService`: Novo campo `WorktreeSession`, registrando `{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }`; restaurar diretório de trabalho do worktree ao usar `--resume`
- Prompt da ferramenta: Escrever instruções de uso para cada ferramenta, esclarecendo quando chamar e quando não chamar

**Arquivos afetados:**

| Arquivo                                                   | Tipo de Alteração                                  |
| --------------------------------------------------------- | -------------------------------------------------- |
| `packages/core/src/tools/tool-names.ts`                   | Adicionar constantes `ENTER_WORKTREE`, `EXIT_WORKTREE` |
| `packages/core/src/tools/EnterWorktreeTool/`              | Novo diretório: `EnterWorktreeTool.ts`, `prompt.ts` |
| `packages/core/src/tools/ExitWorktreeTool/`               | Novo diretório: `ExitWorktreeTool.ts`, `prompt.ts`  |
| `packages/core/src/services/gitWorktreeService.ts`        | Nova interface de nível de sessão (sem alterar interface do Arena) |
| `packages/core/src/services/sessionService.ts`            | Novo campo `WorktreeSession` e métodos de leitura/escrita |
| `packages/core/src/tools/` ponto de registro              | Registrar novas ferramentas                         |

**Fora do escopo da Fase A:**

- Isolamento de Agente (Fase B)
- Configuração de hooks e outros setups pós-criação (Fase C)
- Exibição de estado na UI (Fase C)

---

### Fase B: Isolamento de Agente (AgentTool `isolation: 'worktree'`) + Atualização de Descrições

**Objetivo:** Modelo pode criar worktrees temporários isolados para subagentes, que são limpos automaticamente após o término do agente; atualizar simultaneamente as descrições e prompts das ferramentas afetadas.

**Funcionalidades a implementar:**

*Núcleo do Isolamento de Agente:*

- `AgentTool` novo parâmetro `isolation?: 'worktree'`
- Criar worktree temporário ao iniciar o agente (slug: `agent-{7hex}`, caminho: `.qwen/worktrees/agent-{7hex}`)
- Após o término do agente: sem alterações, excluir automaticamente; com alterações, manter, retornando o caminho e branch no resultado
- Limpeza automática de worktrees expirados: Escanear `.qwen/worktrees/`, corresponder ao padrão `agent-{7hex}`, excluir se mais de 30 dias e sem commits não enviados, estratégia fail-closed

*Atualização de Descrições e Prompts:*

- Descrição do `AgentTool` complementada com explicação do parâmetro `isolation: 'worktree'` (referência `claude-code AgentTool/prompt.ts:272`)
- Novo `buildWorktreeNotice()`: Quando um subagente bifurcado (fork) está rodando em um worktree, injetar um contexto informando que está em um worktree isolado, caminho herdado do agente pai, necessidade de reler arquivos antes de editar (referência `claude-code forkSubagent.ts:buildWorktreeNotice`)

*Sem alterações necessárias:*

- review skill (`SKILL.md`): review usa mecanismo independente (caminho `.qwen/tmp/review-pr-<n>`, criado via comando `qwen review fetch-pr`), completamente diferente do caminho e mecanismo do worktree universal, não há confusão

**Garantia de Compatibilidade com Arena:** Arena não cria worktrees através do parâmetro `isolation` internamente; esta alteração não toca o código do Arena.

**Arquivos afetados:**

| Arquivo                                               | Tipo de Alteração                                        |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `packages/core/src/tools/agent/agent.ts`              | Adicionar parâmetro `isolation` e lógica de criação/limpeza de worktree |
| `packages/core/src/tools/agent/fork-subagent.ts`      | Adicionar `buildWorktreeNotice()` e injetar no modo worktree |
| `packages/core/src/services/gitWorktreeService.ts`    | Adicionar `createAgentWorktree()` / `removeAgentWorktree()` |
| `packages/core/src/services/worktreeCleanup.ts`       | Novo: Lógica de limpeza automática de worktrees expirados |

---

### Fase C: Integridade da Sessão (Persistência SessionService + Rede de Segurança na UI)

**Objetivo:** Estado do worktree pode ser restaurado após interrupção da sessão; o usuário sempre sabe em qual worktree está na interface; aviso de segurança ao sair da sessão.

**Funcionalidades a implementar:**

*Persistência do estado do worktree no SessionService + restauração com `--resume`:*

- `SessionService` estender campo `WorktreeSession`, registrando `{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }`
- `EnterWorktreeTool` chamar `sessionService.setWorktreeSession()` para escrever o estado
- `ExitWorktreeTool` chamar `sessionService.clearWorktreeSession()` para limpar o estado
- Caminho de inicialização `--resume` ler este campo, restaurar `targetDir` e injetar contexto para o modelo

*Setup pós-criação:*

- Após criar worktree, executar automaticamente `git config core.hooksPath <mainRepo>/.git/hooks`, garantindo que os commits dentro do worktree tenham comportamento consistente com os hooks do repositório principal

*Exibição do worktree na StatusLine:*

- `UIStateContext` novo campo `activeWorktree` (lido do estado da sessão), atualizado ao entrar/sair do worktree na sessão
- Payload do `StatusLineCommandInput` novo campo `worktree?: { slug: string; branch: string }`, para uso por scripts de statusline do usuário
- `Footer` exibir embutido uma linha `⎇ <branch> (<slug>)` quando `activeWorktree` não estiver vazio, sem necessidade de configurar script de statusline para obter visibilidade básica

*WorktreeExitDialog:*

- Novo componente `WorktreeExitDialog.tsx`, seguindo a escrita existente de Dialog
- Modificar lógica de tratamento da tecla de saída (Ctrl+C / Ctrl+D): Ao detectar `activeWorktree` não vazio, interceptar a segunda confirmação, exibir Dialog para o usuário escolher entre keep ou remove
- Ações keep / remove reutilizam o caminho existente de `ExitWorktreeTool`

**Arquivos afetados:**

| Arquivo                                                       | Tipo de Alteração                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/core/src/services/sessionService.ts`                | Adicionar campo `WorktreeSession` e métodos de leitura/escrita                 |
| `packages/core/src/tools/enter-worktree.ts`                   | Chamar `sessionService.setWorktreeSession()`                                   |
| `packages/core/src/tools/exit-worktree.ts`                    | Chamar `sessionService.clearWorktreeSession()`                                 |
| `packages/core/src/services/gitWorktreeService.ts`            | Após `createUserWorktree()` / `createAgentWorktree()`, anexar config `core.hooksPath` |
| `packages/cli/src/ui/contexts/UIStateContext.tsx`             | Adicionar campo `activeWorktree` e ações set/clear                             |
| `packages/cli/src/ui/hooks/useStatusLine.ts`                  | `StatusLineCommandInput` adicionar campo `worktree`                            |
| `packages/cli/src/ui/components/Footer.tsx`                   | Exibição embutida da linha de worktree                                         |
| `packages/cli/src/ui/components/WorktreeExitDialog.tsx`       | Novo arquivo                                                                   |
| `packages/cli/src/ui/components/DialogManager.tsx`            | Registrar `WorktreeExitDialog`                                                 |
| `packages/cli/src/ui/components/ExitWarning.tsx` ou tratamento de tecla de saída | Detectar `activeWorktree` e interceptar saída                   |

---

### Fase D: Configuração na Inicialização (Sinalizador CLI `--worktree` + Links Simbólicos de Diretórios + Referência de PR)

**Objetivo:** Suportar entrada direta em worktree na inicialização, reduzir sobrecarga de disco em projetos grandes através de links simbólicos de diretórios, e criar rapidamente worktree baseado em um pull request via referência de PR.

**Escopo:** Três funcionalidades implementadas juntas em uma fase, pois todas dependem do mesmo ponto de entrada de inicialização, e tanto symlink quanto PR fetch precisam ser executados imediatamente após a criação do worktree — dividir separadamente repetiria a sequência de bootstrap.

#### D-1: Sinalizador CLI `--worktree [name]`

**Forma do parâmetro:** Opção yargs aceita três formas:

| Forma                       | Comportamento                                                      |
| --------------------------- | ------------------------------------------------------------------ |
| `qwen --worktree`           | flag simples, gera slug automaticamente (`{adjetivo}-{substantivo}-{6hex}`) |
| `qwen --worktree my-name`   | slug explícito, segue as regras de validação de slug do `EnterWorktreeTool` |
| `qwen --worktree=my-name`   | Equivalente ao anterior                                             |

Não fornecer alias curto `-w` (no qwen-code, aliases curtos são reservados apenas para os parâmetros mais frequentes, para evitar conflitos de nomenclatura).

**Sequência de inicialização:** O worktree é criado nas seguintes posições:

1. `parseArguments()` analisa argv (existente)
2. Seletor de resume (existente, linha 588-629 de `gemini.tsx`)
3. `loadCliConfig()` inicializa Config + auth (existente, linha 643-653)
4. **Novo:** Se `argv.worktree !== undefined`, chamar `createUserWorktree()`
   - Escrever no sidecar (`writeWorktreeSession()`)
   - Definir `process.chdir(worktreePath)` e também `Config.setTargetDir(worktreePath)`
   - Caminho de re-attach para o mesmo worktree: Pular `git worktree add` e chdir no local (correção da Fase 6). Combinações de `--resume` × `--worktree` entre diferentes projectHash falharão na fase de busca de sessão, detalhes abaixo em "Prioridade com `--resume`".
5. Loop principal (entradas TUI / headless `-p` / ACP todas passam pelo passo 4)

**Diferença da simplificação da Fase A:** A ferramenta `EnterWorktreeTool` da Fase A **não** modifica `Config.targetDir`, depende do modelo ler o caminho absoluto do resultado da ferramenta e continuar usando. O sinalizador CLI da Fase D entra em vigor na inicialização, sem contexto de modelo em execução para compatibilidade, então **altera diretamente `targetDir` e `process.cwd()`** — esta é uma garantia de isolamento mais forte. Os dois caminhos têm comportamentos diferentes, devem ser explicados na documentação do usuário.

**Comportamento de saída:** Reutiliza `WorktreeExitDialog` existente (já implementado na Fase C). Ctrl+C/D duas vezes → Usuário escolhe entre keep / remove / cancel. Nenhum novo caminho de código necessário.

**Prioridade com `--resume`:**

Como o armazenamento da sessão usa `projectHash(process.cwd())` como chave, e `--worktree` faz chdir para o worktree antes do seletor de resume / `loadCliConfig`, uma "sessão iniciada no worktree X, retomada de dentro do worktree Y" é **arquiteturalmente inalcançável** (os projectHash são diferentes, os arquivos de sessão caem em diretórios diferentes). A tabela abaixo reflete o comportamento real após a implementação do D-1 + correção de re-attach da Fase 6:

| Estado `--resume`              | Estado `--worktree`          | Resultado                                                                                     |
| ------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------- |
| Nenhum                         | Nenhum                       | Sessão normal, sem worktree                                                                   |
| Nenhum                         | Sim (novo slug)              | Criar novo worktree                                                                           |
| Nenhum                         | Sim (slug já existente)      | **Re-attach** ao worktree existente (correção Fase 6)                                         |
| Sim                            | Nenhum                       | Restaurar worktree antigo (comportamento Fase C, se sidecar acertar, injetar lembrete)        |
| Sim (sid do mesmo worktree)    | Sim (mesmo slug, re-attach)  | Re-attach + sessão encontrada: resume normal                                                  |
| Sim (sid do checkout principal)| Sim (qualquer slug)          | **Falha na busca de sessão**: `No saved session found with ID …`, exit 1. Limitação documentada |
| Sim (sid do worktree X)        | Sim (slug Y, X != Y)         | Mesmo, sessão não encontrável entre projectHash                                               |

A semântica de override entre projectHash (`--worktree` transferindo sessão entre diferentes worktrees / checkout principal) exigiria ancorar o storage à raiz do repositório em vez do projectHash derivado de cwd, o que pertence a uma futura refatoração do Config. O código de ramificação `overrodeResumedWorktree` dentro de `persistStartupWorktreeSidecar` é mantido para entrar em vigor automaticamente após essa refatoração; atualmente não é acionado no caminho de produção.

#### D-2: Item de Configuração `worktree.symlinkDirectories`

**Schema:**

```jsonc
{
  "worktree": {
    "symlinkDirectories": ["node_modules", "dist", ".turbo"],
  },
}
```

- Tipo: `string[]`, padrão `undefined` (não ativado, opt-in)
- O namespace de nível superior `worktree` é novo (inserido em ordem alfabética entre `tools` e `ui` em `settingsSchema.ts`)
- Caminhos **relativos à raiz do repositório principal**; caminhos absolutos ou contendo `..` são rejeitados por guarda de path traversal

**Escopo:** Todos os worktrees criados pela camada universal, incluindo:

- `EnterWorktreeTool` (Fase A)
- `AgentTool isolation: 'worktree'` (Fase B)
- Sinalizador CLI `--worktree` (Fase D-1)

Worktrees do Arena não passam pela camada universal, **não** são afetados por esta configuração.

**Local de implementação:** `GitWorktreeService.performPostCreationSetup()` — imediatamente após o existente `configureHooksPath()` (padrão estabelecido na Fase C). Adicionar novo método `symlinkConfiguredDirectories()`, percorrendo os itens de configuração e chamando `fs.symlink(absSource, absDest, 'dir')`.

**Tratamento de erros (fail-open):**

| Cenário                         | Comportamento                        |
| ------------------------------- | ------------------------------------ |
| Diretório fonte não existe (ENOENT) | Pular silenciosamente, log de debug |
| Caminho destino já existe (EEXIST) | Pular silenciosamente, log de debug (não sobrescrever) |
| Path traversal (`../`, caminho absoluto, etc.) | Rejeitar o item, log de debug warn |
| Outro erro de I/O               | Log de debug warn, continuar processando próximos itens |

A criação do worktree em si **não** é abortada devido a falha de symlink — mesmo princípio "best-effort post-creation setup" de `configureHooksPath()`.

#### D-3: Resolução de Referência de PR (`--worktree=#<N>` / URL completa)

**Formas suportadas:**

| Forma                                                           | Número do PR resolvido |
| --------------------------------------------------------------- | ---------------------- |
| `--worktree=#123`                                               | 123                    |
| `--worktree '#123'`                                             | 123                    |
| `--worktree https://github.com/foo/bar/pull/123`                | 123                    |
| `--worktree https://gh.enterprise.com/foo/bar/pull/123?baz=qux` | 123                    |

**Nomenclatura do slug e branch:**

- slug: `pr-<N>` (prefixo especial reservado, distinto de slugs de usuário)
- branch: `worktree-pr-<N>` (seguindo a regra de nomenclatura existente do qwen-code `worktree-<slug>`; não usar a nomenclatura direta `pr-<N>` do claude-code para evitar conflito com branches `pr-<N>` locais)

**Estratégia de fetch:**

```
git fetch origin pull/<N>/head
→ Usar FETCH_HEAD como base do novo worktree
```

Não depende da CLI `gh` — puro git fetch, suporta qualquer instância do GitHub (pública ou enterprise), desde que o remote `origin` aponte para o GitHub.

**Caminhos de erro:**

| Cenário                    | Mensagem de Erro                                                                 |
| -------------------------- | -------------------------------------------------------------------------------- |
| Remote `origin` ausente    | `--worktree=#<N> requires an "origin" remote that points at GitHub.`             |
| `git fetch` falhou         | `Failed to fetch PR #<N>: PR may not exist or origin remote is unreachable.`     |
| Timeout de rede (30s)      | Mesmo acima, adicionar `(timeout)`                                               |
| Remote `origin` não é GitHub | Não fazer verificação ativa, deixar `git fetch` falhar naturalmente (protocolo PR é específico do GitHub) |

**Relação com D-2:** Worktrees de PR **também** aplicam `symlinkDirectories` (o usuário espera poder executar testes imediatamente no PR, diretórios de dependências precisam ser reutilizados).

#### Arquivos Afetados

| Arquivo                                                       | Tipo de Alteração                                                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/config/config.ts`                           | yargs adicionar opção `--worktree`; interface `CliArgs` adicionar `worktree?: string \| boolean`            |
| `packages/cli/src/gemini.tsx`                                 | Após `loadCliConfig()`, antes do loop principal, chamar novo helper `setupStartupWorktree()`                |
| `packages/cli/src/startup/worktreeStartup.ts`                 | Novo: `setupStartupWorktree()` trata resolução de slug, PR fetch, escrita sidecar, troca de cwd             |
| `packages/cli/src/nonInteractiveCli.ts`                       | Reutilizar mesmo helper (já existe lógica de injeção `restoreWorktreeContext`, sem alteração)               |
| `packages/cli/src/acp-integration/acpAgent.ts`                | Reutilizar mesmo helper                                                                                     |
| `packages/core/src/services/gitWorktreeService.ts`            | Adicionar `parsePRReference()`, `fetchPullRequestRef()`, `symlinkConfiguredDirectories()`; `createUserWorktree()` aceitar parâmetro opcional `baseBranchRef` |
| `packages/cli/src/config/settingsSchema.ts`                   | Adicionar item de nível superior `worktree.symlinkDirectories: string[]`                                    |
| `packages/vscode-ide-companion/schemas/settings.schema.json`  | Regenerar                                                                                                   |
| `docs/users/features/worktree.md`                             | Adicionar nova seção Quick Start CLI flag, tabela de Configurações adicionar uma linha                      |

#### Segurança e Rollback

- **fail-open vs fail-close:** Falha de symlink / hooks **não** aborta a criação do worktree (mesmo padrão da Fase C); falha de PR fetch **aborta** a inicialização (sem base ref não é possível criar worktree); falha de validação de slug **aborta** a inicialização (consistente com `EnterWorktreeTool`).
- **Path traversal:** Itens de `symlinkDirectories` precisam, após resolução, ainda estar dentro de `repoRoot`, caso contrário, rejeitar o item e logar.
- **Timeout de PR fetch:** 30 segundos de timeout duro, para evitar que uma rede sem resposta trave a inicialização.
- **Efeito colateral da troca de cwd:** Após alterar `process.cwd()`, a resolução de caminhos relativos (ex.: `--prompt-file ./foo.txt`) será afetada. **Contramedida:** Antes de trocar cwd, resolver primeiro todos os parâmetros de caminho relativo (especificamente no ponto de entrada de `setupStartupWorktree()`, fazer uma normalização).

#### Perguntas em Aberto

1. **`--worktree-keep-on-exit`?** claude-code não tem; qwen-code precisa de um sinalizador CLI para que o Exit Dialog escolha keep por padrão? Sugestão: **não adicionar por enquanto**, aguardar feedback do usuário.
2. **`worktree.symlinkDirectories` precisa de override por projeto?** As configurações atuais já suportam mesclagem de três níveis (usuário/workspace/projeto), sem necessidade de tratamento especial.
3. **PR fetch deve buscar o ref `merge` (`pull/<N>/merge`, o ref mesclado com a base) em vez de `head`?** claude-code escolhe `head`, argumentando que o usuário geralmente quer ver as alterações reais do PR. Manter esta escolha.

---

### Futuro: Funcionalidades Avançadas (Implementar Sob Demanda)

As funcionalidades abaixo são voltadas para cenários de uso mais específicos; não estão programadas para a fase atual, aguardando esclarecimento das necessidades do usuário para avaliar implementação.

| Funcionalidade             | Descrição                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| sparse checkout            | Item de configuração `worktree.sparsePaths`; em grandes monorepos, fazer checkout apenas dos caminhos especificados, reduzindo tempo de criação e uso de disco |
| Arquivo `.worktreeinclude` | Copiar automaticamente para o worktree arquivos ignorados pelo gitignore (`.env`, `secrets.json`, etc.)        |
| Integração com tmux        | `--worktree --tmux` inicia sessão worktree em uma nova janela tmux                                             |