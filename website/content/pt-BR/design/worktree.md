# Design das Capacidades Genéricas do Worktree

## Declaração do Problema

Atualmente, o qwen-code possui apenas uma implementação interna de worktree voltada para o cenário de comparação multi-modelo da Arena (`GitWorktreeService`). Os usuários não conseguem usar o worktree para isolar o trabalho em sessões comuns, e o AgentTool também não suporta a criação de ambientes de worktree isolados para subagentes.

O objetivo é tornar o worktree uma capacidade genérica, com suporte ao isolamento em nível de sessão do usuário e em nível de agente, garantindo ao mesmo tempo que a experiência funcional existente da Arena permaneça completamente inalterada.

## Comparação do Estado Atual

| Funcionalidade                        | qwen-code       | claude-code | Fase     |
| ------------------------------------- | --------------- | ----------- | -------- |
| Ferramenta `EnterWorktree`            | ✅ (Fase A)     | ✅          | —        |
| Ferramenta `ExitWorktree`             | ✅ (Fase A)     | ✅          | —        |
| AgentTool `isolation: 'worktree'`     | ✅ (Fase B)     | ✅          | —        |
| Limpeza automática de worktrees expirados | ✅ (Fase B) | ✅          | —        |
| Persistência e restauração do estado da sessão worktree | ❌ | ✅ | Fase C |
| Configuração pós-criação (hooks)      | ❌              | ✅          | Fase C   |
| Exibição do estado do worktree na StatusLine | ❌       | ✅          | Fase C   |
| WorktreeExitDialog (aviso de saída)   | ❌              | ✅          | Fase C   |
| Sinalizador CLI `--worktree`          | ✅ (Fase D)     | ✅          | —        |
| Diretórios de link simbólico (node_modules, etc.) | ✅ (Fase D) | ✅ | —    |
| Referência de PR (`--worktree=#123`)  | ✅ (Fase D)     | ✅          | —        |
| sparse checkout                       | ❌              | ✅          | Futuro   |
| Integração com tmux                   | ❌              | ✅          | Futuro   |
| Isolamento de worktree multi-modelo da Arena | ✅ (exclusivo qwen) | ❌   | —        |
| Sobrescrita de estado sujo (stash + copy) | ✅          | ✅          | —        |
| Rastreamento do commit de base        | ✅ (exclusivo qwen) | ❌       | —        |

## Princípios de Design

**Worktree é uma capacidade genérica, a Arena é sua aplicação de nível superior.**

- Camada de worktree genérica: ferramentas `EnterWorktree`/`ExitWorktree`, parâmetro `isolation` do AgentTool, gerenciamento de estado da sessão, limpeza automática
- Camada da Arena: agendamento paralelo multi-modelo, caminho personalizado `worktreeBaseDir`, criação em lote e comparação de diff, continua utilizando a lógica existente de `GitWorktreeService.setupWorktrees()`, sem ser afetada pelas alterações na camada genérica

O `isolation: 'worktree'` do AgentTool segue apenas o caminho genérico. A Arena não cria worktrees por meio desse parâmetro internamente; os dois caminhos são independentes.

## Caminhos e Configuração

### Caminho do worktree genérico

Worktrees criados pela ferramenta `EnterWorktree` ou pelo AgentTool com `isolation: 'worktree'` são armazenados fixamente em:

```
{raiz do repositório git}/.qwen/worktrees/{slug}
```

O caminho não é configurável. Regra de nomenclatura do slug:

- Worktree de sessão do usuário: nome especificado pelo usuário, ou gerado automaticamente (formato: `{adjetivo}-{substantivo}-{4 caracteres aleatórios}`)
- Worktree de agente: `agent-{7 caracteres hexadecimais aleatórios}`

### Caminho do worktree da Arena (já existente, permanece inalterado)

O caminho do worktree da Arena é controlado por `agents.arena.worktreeBaseDir`, padrão `~/.qwen/arena` (`ArenaManager.ts:125`), completamente independente do caminho genérico, sem qualquer alteração.

### Configurações Estendidas

| Item de Configuração                 | Tipo       | Uso                                                                     | Fase     |
| ------------------------------------ | ---------- | ----------------------------------------------------------------------- | -------- |
| `ui.hideBuiltinWorktreeIndicator`    | `boolean`  | Oculta a linha `⎇ worktree-… (…)` embutida no Footer, deixa para custom statusline | Fase C |
| `worktree.symlinkDirectories`        | `string[]` | Cria links simbólicos de diretórios especificados (ex.: `node_modules`) para o worktree, evitando desperdício de disco | Fase D |
| `worktree.sparsePaths`               | `string[]` | Modo cone do git sparse-checkout, escreve apenas os caminhos especificados em grandes monorepos | Futuro  |

Nenhum novo item de configuração é adicionado nas Fases A / B.

## Design das Ferramentas

### EnterWorktree

**Condições de disparo:** O usuário explicitamente diz "iniciar um worktree", "usar um worktree", "criar um worktree" e palavras semelhantes. Não deve ser acionado automaticamente quando o usuário disser "corrigir bug" ou "desenvolver funcionalidade".

**Schema de entrada:**

```
name?: string  // Opcional, formato slug: letras/números/ponto/sublinhado/traço, máximo 64 caracteres
```

**Comportamento:**

1. Verificar se já não está em um worktree (evita aninhamento)
2. Resolver para a raiz do repositório git (trata casos em que já está em um subdiretório)
3. Chamar `GitWorktreeService` para criar o worktree, caminho como `.qwen/worktrees/{slug}`
4. Gravar a sessão do worktree no `SessionService`
5. Alterar o diretório de trabalho para o caminho do worktree
6. Limpar o cache de arquivos

**Saída:** `worktreePath`, `worktreeBranch`, `message`

### ExitWorktree

**Condições de disparo:** O usuário diz "sair do worktree", "deixar o worktree", "voltar" etc.

**Schema de entrada:**

```
action: 'keep' | 'remove'
discard_changes?: boolean  // Válido apenas quando action='remove'
```

**Guardas de segurança:**

- Opera apenas no worktree criado por `EnterWorktree` nesta sessão
- Quando `action='remove'` e existem alterações não commitadas, a execução é recusada (a menos que `discard_changes: true`)

**Comportamento:**

- `keep`: Limpa o estado do worktree na sessão, mantém o diretório e o branch do worktree, restaura o diretório de trabalho original
- `remove`: Exclui o diretório do worktree, exclui o branch git correspondente, limpa o estado da sessão, restaura o diretório de trabalho original

**Saída:** `action`, `originalCwd`, `worktreePath`, `worktreeBranch`

## Formas de Acionamento pelo Usuário

| Forma                     | Exemplo                                                              | Fase de Implementação |
| ------------------------- | -------------------------------------------------------------------- | --------------------- |
| Solicitação explícita na sessão | Usuário diz "comece a trabalhar em um worktree" → modelo chama EnterWorktree | Fase A                |
| Isolamento de agente      | Modelo define `isolation: 'worktree'` para subagente                 | Fase B                |
| Sinalizador CLI de início | `qwen --worktree my-feature`                                        | Fase D                |

Não há comandos com barra. O acionamento do worktree na sessão depende da menção explícita do usuário; `isolation: 'worktree'` é o cenário onde o modelo decide autonomamente.

## Plano de Implementação por Fases

### Fase A: Ferramentas Principais (worktree em nível de sessão do usuário)

**Objetivo:** O usuário pode entrar/sair do worktree durante a sessão.

**Funcionalidades a implementar:**

- Ferramenta `EnterWorktree`: criar worktree, alterar diretório de trabalho, registrar estado da sessão
- Ferramenta `ExitWorktree`: duas formas de saída (keep/remove), guardas de segurança
- Extensão do `GitWorktreeService`: novos métodos `createUserWorktree()` / `removeUserWorktree()` voltados para sessão de único usuário, reutilizando a lógica git existente, sem modificar as interfaces em lote usadas pela Arena
- Extensão do `SessionService`: novo campo `WorktreeSession`, registrando `{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }`; restaurar diretório de trabalho do worktree ao usar `--resume`
- Prompt das ferramentas: escrever instruções de uso para cada ferramenta, esclarecendo quando chamar e quando não chamar

**Arquivos afetados:**

| Arquivo                                                 | Tipo de Alteração                                 |
| ------------------------------------------------------- | ------------------------------------------------- |
| `packages/core/src/tools/tool-names.ts`                 | Adicionar constantes `ENTER_WORKTREE`, `EXIT_WORKTREE` |
| `packages/core/src/tools/EnterWorktreeTool/`            | Novo diretório: `EnterWorktreeTool.ts`, `prompt.ts` |
| `packages/core/src/tools/ExitWorktreeTool/`             | Novo diretório: `ExitWorktreeTool.ts`, `prompt.ts` |
| `packages/core/src/services/gitWorktreeService.ts`      | Adicionar interfaces para sessão de usuário (sem modificar interface da Arena) |
| `packages/core/src/services/sessionService.ts`          | Adicionar campo `WorktreeSession` e métodos de leitura/escrita |
| Ponto de registro em `packages/core/src/tools/`         | Registrar novas ferramentas                       |
**Não está no escopo da Fase A:**

- Isolamento de Agent (Fase B)
- Configuração de hooks etc. pós-criação (Fase C)
- Exibição do estado na UI (Fase C)

---

### Fase B: Isolamento de Agent (`AgentTool` `isolation: 'worktree'`) + Atualização de descrição

**Objetivo:** O modelo pode criar uma worktree isolada temporária para o subagent, que é limpa automaticamente após o término do agent; atualizar simultaneamente as descrições de ferramentas e prompts afetados.

**Funcionalidades a implementar:**

_Núcleo de isolamento de Agent:_

- `AgentTool` novo parâmetro `isolation?: 'worktree'`
- Ao iniciar o Agent, criar uma worktree temporária (slug: `agent-{7hex}`, caminho: `.qwen/worktrees/agent-{7hex}`)
- Após o término do Agent: sem alterações → remover automaticamente; com alterações → manter, retornar o caminho e o branch no resultado
- Limpeza automática de worktrees expiradas: escanear `.qwen/worktrees/`, corresponder ao padrão `agent-{7hex}`, remover se >30 dias e sem commits não enviados, estratégia fail-closed

_Atualização de descrições e prompts:_

- A descrição de `AgentTool` complementar com a explicação do parâmetro `isolation: 'worktree'` (referência `claude-code AgentTool/prompt.ts:272`)
- Nova função `buildWorktreeNotice()`: quando o fork subagent executa em uma worktree, injetar um contexto indicando que ele está em uma worktree isolada, o caminho herdado do agent pai, e que precisa reler os arquivos antes de editar (referência `claude-code forkSubagent.ts:buildWorktreeNotice`)

_Nenhuma alteração necessária:_

- review skill (`SKILL.md`): review usa mecanismo independente (caminho `.qwen/tmp/review-pr-<n>`, criado via comando `qwen review fetch-pr`), totalmente diferente do caminho e mecanismo da worktree genérica, não há confusão

**Garantia de compatibilidade com Arena:** Arena não cria worktrees internamente através do parâmetro `isolation`, esta alteração não toca o código do Arena.

**Arquivos afetados:**

| Arquivo                                               | Tipo de alteração                                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/core/src/tools/agent/agent.ts`              | Novo parâmetro `isolation` e lógica de criação/limpeza de worktree                 |
| `packages/core/src/tools/agent/fork-subagent.ts`      | Nova função `buildWorktreeNotice()` e injeção no modo worktree                     |
| `packages/core/src/services/gitWorktreeService.ts`    | Novos `createAgentWorktree()` / `removeAgentWorktree()`                            |
| `packages/core/src/services/worktreeCleanup.ts`       | Novo: lógica de limpeza automática de worktrees expiradas                          |

---

### Fase C: Integridade da sessão (Persistência do SessionService + Rede de segurança da UI)

**Objetivo:** O estado da worktree pode ser recuperado após interrupção da sessão; o usuário sempre sabe em qual worktree está na interface; há um aviso de segurança ao sair da sessão.

**Funcionalidades a implementar:**

_Persistência do estado da worktree no SessionService + restauração com `--resume`:_

- `SessionService` estender o campo `WorktreeSession`, registrar `{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }`
- `EnterWorktreeTool` chamar `sessionService.setWorktreeSession()` para gravar o estado
- `ExitWorktreeTool` chamar `sessionService.clearWorktreeSession()` para limpar o estado
- Ao iniciar com `--resume`, ler este campo, restaurar `targetDir` e injetar contexto no modelo

_Configuração pós-criação:_

- Após criar a worktree, executar automaticamente `git config core.hooksPath <mainRepo>/.git/hooks` para garantir que os commits dentro da worktree sigam os hooks do repositório principal

_Exibição da worktree na StatusLine:_

- `UIStateContext` novo campo `activeWorktree` (lido do estado da sessão), atualizado ao entrar/sair da worktree
- `StatusLineCommandInput` payload novo campo `worktree?: { slug: string; branch: string }`, para uso em scripts do usuário na statusline
- `Footer` quando `activeWorktree` não estiver vazio, exibir internamente uma linha `⎇ <branch> (<slug>)`, sem necessidade de configurar script de statusline para visibilidade básica

_WorktreeExitDialog:_

- Novo componente `WorktreeExitDialog.tsx`, seguindo a escrita de Dialog existente
- Modificar a lógica da tecla de saída (Ctrl+C / Ctrl+D): detectar `activeWorktree` não vazio, interceptar segunda confirmação, exibir Dialog pedindo ao usuário para escolher manter (keep) ou remover (remove)
- Operações de keep / remove reutilizam os caminhos existentes de `ExitWorktreeTool`

**Arquivos afetados:**

| Arquivo                                                          | Tipo de alteração                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionService.ts`                   | Novo campo `WorktreeSession` e métodos de leitura/escrita                                                 |
| `packages/core/src/tools/enter-worktree.ts`                      | Chamar `sessionService.setWorktreeSession()`                                                              |
| `packages/core/src/tools/exit-worktree.ts`                       | Chamar `sessionService.clearWorktreeSession()`                                                            |
| `packages/core/src/services/gitWorktreeService.ts`               | Após `createUserWorktree()` / `createAgentWorktree()`, adicionar configuração `core.hooksPath`            |
| `packages/cli/src/ui/contexts/UIStateContext.tsx`                | Novo campo `activeWorktree` e ações set/clear                                                             |
| `packages/cli/src/ui/hooks/useStatusLine.ts`                     | `StatusLineCommandInput` novo campo `worktree`                                                            |
| `packages/cli/src/ui/components/Footer.tsx`                      | Exibição interna da linha de worktree                                                                     |
| `packages/cli/src/ui/components/WorktreeExitDialog.tsx`          | Novo                                                                                                      |
| `packages/cli/src/ui/components/DialogManager.tsx`               | Registrar `WorktreeExitDialog`                                                                            |
| `packages/cli/src/ui/components/ExitWarning.tsx` ou lógica da tecla de saída | Detectar `activeWorktree` e interceptar saída                                                             |

---

### Fase D: Configuração na inicialização (flag CLI `--worktree` + link simbólico de diretório + referência de PR)

**Objetivo:** Suportar entrar diretamente em uma worktree na inicialização, reduzir a sobrecarga de disco em grandes projetos com links simbólicos de diretório, e criar rapidamente uma worktree baseada em um pull request através de referência de PR.

**Escopo:** Os três recursos são implementados juntos na mesma fase, pois todos dependem do mesmo ponto de entrada de inicialização, e tanto o symlink quanto o fetch de PR precisam ser executados imediatamente após a criação da worktree — dividir separadamente repetiria a sequência de bootstrap.

#### D-1: Flag CLI `--worktree [name]`

**Forma do parâmetro:** Opção yargs aceita três formas:

| Forma                      | Comportamento                                                   |
| -------------------------- | --------------------------------------------------------------- |
| `qwen --worktree`          | flag simples, gera slug automaticamente (`{adjetivo}-{substantivo}-{6hex}`) |
| `qwen --worktree meu-nome` | slug explícito, seguindo as regras de validação de slug de `EnterWorktreeTool` |
| `qwen --worktree=meu-nome` | Equivalente ao anterior                                         |
Não forneça o alias curto `-w` (os aliases curtos do qwen-code são reservados apenas para os parâmetros mais frequentes, para evitar conflitos de nomenclatura).

**Sequência de inicialização:** O worktree é criado nos seguintes locais:

1. `parseArguments()` analisa argv (já existente)
2. Seletor de retomada (já existente, linhas 588-629 de `gemini.tsx`)
3. `loadCliConfig()` inicializa Config + auth (já existente, linhas 643-653)
4. **Novo:** Se `argv.worktree !== undefined`, chame `createUserWorktree()`
   - Escreve sidecar (`writeWorktreeSession()`)
   - Define `process.chdir(worktreePath)` e simultaneamente `Config.setTargetDir(worktreePath)`
   - Caminho de reanexação ao mesmo worktree: pula `git worktree add` e faz chdir no local (corrigido na Fase 6). A combinação `--resume` × `--worktree` com `projectHash` diferente falha na fase de busca de sessão, conforme detalhado em "Prioridade com `--resume`" abaixo.
5. Loop principal (TUI / headless `-p` / ACP – todas as três entradas devem passar pelo passo 4)

**Diferença da simplificação da Fase A:** A `EnterWorktreeTool` da Fase A **não** modifica `Config.targetDir`; depende do modelo ler o caminho absoluto dos resultados da ferramenta e continuar usando-o. A flag CLI da Fase D entra em vigor no início, sem necessidade de compatibilidade com contexto de modelo em execução, portanto **muda diretamente `targetDir` e `process.cwd()`** – isso é uma garantia de isolamento mais forte. As duas rotas se comportam de forma diferente, o que precisa ser documentado na documentação do usuário.

**Comportamento de saída:** Reutiliza o `WorktreeExitDialog` existente (já implementado na Fase C). Ctrl+C/D duas vezes aciona → o usuário escolhe entre manter / remover / cancelar. Não é necessário novo caminho de código.

**Prioridade com `--resume`:**

Como o armazenamento de sessão usa `projectHash(process.cwd())` como chave, e `--worktree` faz chdir para o worktree antes do seletor de retomada / `loadCliConfig`, "iniciar uma sessão no worktree X e retomá-la de dentro do worktree Y" é **arquiteturalmente inatingível** (os projectHash são diferentes, os arquivos de sessão ficam em diretórios distintos). A tabela abaixo reflete o comportamento real após a implementação D-1 + correção de reanexação da Fase 6:

| Estado de `--resume`              | Estado de `--worktree`          | Resultado                                                                                       |
| -------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| Nenhum                           | Nenhum                         | Sessão normal, sem worktree                                                                     |
| Nenhum                           | Sim (novo slug)               | Novo worktree                                                                                   |
| Nenhum                           | Sim (slug existente)          | **Reanexação** ao worktree existente (corrigido na Fase 6)                                      |
| Sim                              | Nenhum                         | Retomar worktree antigo (comportamento da Fase C, sidecar encontrado injeta lembrete)            |
| Sim (sid do mesmo worktree)      | Sim (mesmo slug, reanexação)  | Reanexação + sessão encontrada: retomada normal                                                 |
| Sim (sid do checkout principal)  | Sim (qualquer slug)           | **Falha na busca de sessão**: `Nenhuma sessão salva encontrada com ID …`, exit 1. Limitação documentada |
| Sim (sid do worktree X)          | Sim (slug Y, X != Y)          | Mesmo acima, sessão não encontrável entre projectHash diferentes                                |

A semântica de substituição entre projectHash diferentes (transferir `--worktree` entre sessões de worktree diferente / checkout principal) exigiria que o armazenamento fosse ancorado na raiz do repositório em vez do projectHash derivado de cwd, o que está fora do escopo da futura refatoração do Config. O código do branch `overrodeResumedWorktree` dentro de `persistStartupWorktreeSidecar` é mantido para entrar em vigor automaticamente quando essa refatoração for implementada, mas atualmente não é acionado no caminho de produção.

#### D-2: Item de configuração `worktree.symlinkDirectories`

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
- Caminhos são **relativos à raiz do repositório principal**; caminhos absolutos ou que contenham `..` são rejeitados pelo guarda de path traversal

**Escopo:** Todos os worktrees criados pela camada genérica, incluindo:

- `EnterWorktreeTool` (Fase A)
- `AgentTool` `isolation: 'worktree'` (Fase B)
- Flag CLI `--worktree` (Fase D-1)

Os worktrees da Arena não passam pela camada genérica e **não** são afetados por esta configuração.

**Local de implementação:** `GitWorktreeService.performPostCreationSetup()` – imediatamente após o `configureHooksPath()` existente (padrão estabelecido na Fase C). Adicionar novo método `symlinkConfiguredDirectories()` que itera sobre os itens de configuração e chama `fs.symlink(absSource, absDest, 'dir')`.

**Tratamento de erros (fail-open):**

| Cenário                               | Comportamento                     |
| ------------------------------------- | --------------------------------- |
| Diretório de origem não existe (ENOENT) | Pular silenciosamente, log debug |
| Caminho de destino já existe (EEXIST) | Pular silenciosamente, log debug (não sobrescrever) |
| Path traversal (`../`, caminhos absolutos, etc.) | Rejeitar o item, log debug warn |
| Outros erros de E/S                   | Log debug warn, continuar com os próximos itens |

A criação do worktree em si **não** é interrompida devido a falhas de symlink – mesmo princípio de "configuração pós-criação com melhor esforço" que `configureHooksPath()`.

#### D-3: Resolução de referência de PR (`--worktree=#<N>` / URL completa)

**Formatos suportados:**

| Formato                                                           | Nº do PR resolvido |
| ----------------------------------------------------------------- | ------------------ |
| `--worktree=#123`                                                 | 123                |
| `--worktree '#123'`                                               | 123                |
| `--worktree https://github.com/foo/bar/pull/123`                  | 123                |
| `--worktree https://gh.enterprise.com/foo/bar/pull/123?baz=qux`   | 123                |

**Nomeação do slug e do branch:**

- Slug: `pr-<N>` (prefixo reservado especial, distinto de slugs de usuário)
- Branch: `worktree-pr-<N>` (segue a regra de nomenclatura `worktree-<slug>` existente no qwen-code; não adota a nomenclatura direta `pr-<N>` do claude-code para evitar conflitos com branches locais `pr-<N>`)

**Estratégia de fetch:**

```
git fetch origin pull/<N>/head
→ Usar FETCH_HEAD como base do novo worktree
```

Não depende da CLI `gh` – puro git fetch, suporta qualquer instância do GitHub (público ou corporativo), desde que o remote `origin` aponte para o GitHub.

**Caminhos de erro:**

| Cenário                          | Mensagem de erro                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| Remote `origin` ausente          | `--worktree=#<N> requer um remote "origin" que aponte para o GitHub.`               |
| Falha no `git fetch`             | `Falha ao buscar PR #<N>: o PR pode não existir ou o remote origin está inacessível.` |
| Timeout de rede (30s)            | Mesma de cima, acrescido de `(timeout)`                                              |
| Remote `origin` não é GitHub     | Nenhuma verificação ativa; deixa `git fetch` falhar naturalmente (protocolo de PR é específico do GitHub) |
**Relação com D-2:** O PR worktree **também** aplica `symlinkDirectories` (os usuários esperam poder executar testes imediatamente no PR, e os diretórios de dependências precisam ser reutilizados).

#### Arquivos afetados

| Arquivo                                                         | Tipo de alteração                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/config/config.ts`                          | yargs adiciona opção `--worktree`; interface `CliArgs` adiciona `worktree?: string \| boolean`                                                              |
| `packages/cli/src/gemini.tsx`                                | Após `loadCliConfig()` e antes do loop principal, chama o novo helper `setupStartupWorktree()`                                                                 |
| `packages/cli/src/startup/worktreeStartup.ts`                | Novo: `setupStartupWorktree()` lida com análise de slug, fetch de PR, escrita do sidecar, mudança de cwd                                                            |
| `packages/cli/src/nonInteractiveCli.ts`                      | Reutiliza o mesmo helper (já possui lógica de `restoreWorktreeContext` injetada, sem necessidade de alteração)                                                                          |
| `packages/cli/src/acp-integration/acpAgent.ts`               | Reutiliza o mesmo helper                                                                                                                            |
| `packages/core/src/services/gitWorktreeService.ts`           | Adiciona `parsePRReference()`, `fetchPullRequestRef()`, `symlinkConfiguredDirectories()`; `createUserWorktree()` aceita parâmetro opcional `baseBranchRef` |
| `packages/cli/src/config/settingsSchema.ts`                  | Adiciona item de nível superior `worktree.symlinkDirectories: string[]`                                                                                        |
| `packages/vscode-ide-companion/schemas/settings.schema.json` | Regenerado                                                                                                                                   |
| `docs/users/features/worktree.md`                            | Adiciona nova seção de flag CLI Quick Start; tabela de Configurações adiciona uma nova linha                                                                                        |

#### Segurança e rollback

- **fail-open vs fail-close:** Falha em symlink / hooks **não** interrompe a criação do worktree (mesmo padrão da Fase C); falha no fetch do PR **interrompe** a inicialização (sem ref base não é possível criar worktree); falha na validação do slug **interrompe** a inicialização (consistente com `EnterWorktreeTool`).
- **path traversal:** Os itens de `symlinkDirectories` devem, após resolução, permanecer dentro de `repoRoot`, caso contrário, o item é rejeitado e registrado em log.
- **Timeout de fetch do PR:** Timeout rígido de 30 segundos para evitar que uma rede sem resposta trave a inicialização.
- **Efeito colateral da mudança de cwd:** Após alterar `process.cwd()`, a resolução de caminhos relativos (ex.: `--prompt-file ./foo.txt`) é afetada. **Mitigação:** Resolver todos os argumentos de caminhos relativos antes de mudar o cwd (especificamente, normalizar na entrada de `setupStartupWorktree()`).

#### Questões em aberto

1. **`--worktree-keep-on-exit`?** claude-code não tem, qwen-code precisa de uma flag CLI para que o Diálogo de Saída escolha manter por padrão? Sugestão: **não adicionar por enquanto**, aguardar feedback dos usuários.
2. **`worktree.symlinkDirectories` precisa de sobrescrita por projeto?** As configurações atuais já suportam mesclagem em três níveis (usuário/espaço de trabalho/projeto), sem necessidade de tratamento especial.
3. **O fetch do PR deve buscar a ref `merge` (`pull/<N>/merge`, ou seja, a ref mesclada com a base) em vez de `head`?** claude-code escolhe `head`, com a justificativa de que os usuários geralmente querem ver as alterações reais do PR. Seguimos essa escolha.

---

### Futuro: Funcionalidades avançadas (implementar conforme demanda)

As funcionalidades abaixo são voltadas para cenários de uso mais específicos e não estão no cronograma atual; serão avaliadas quando houver necessidade clara dos usuários.

| Funcionalidade          | Descrição                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| sparse checkout         | Configuração `worktree.sparsePaths` para grandes monorepos fazer checkout apenas de caminhos específicos, reduzindo tempo de criação e uso de disco |
| Arquivo `.worktreeinclude` | Copiar automaticamente para o worktree arquivos ignorados pelo gitignore (`.env`, `secrets.json`, etc.)                       |
| Integração com tmux     | `--worktree --tmux` inicia sessão do worktree em uma nova janela tmux                                      |
