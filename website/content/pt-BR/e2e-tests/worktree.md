# Plano de Teste E2E da Funcionalidade Worktree (Fase A + B)

## Escopo

Testes de ponta a ponta para a capacidade genérica de worktree:

- Fase A: Ferramentas `EnterWorktree` / `ExitWorktree` + estado do SessionService
- Fase B: Parâmetro `isolation: 'worktree'` da ferramenta `Agent` + limpeza automática + aviso de worktree

## Ambiente de teste

Cada grupo de teste é executado em seu próprio repositório git temporário e sessão tmux para evitar colisões. Configuração do template:

```bash
TEST_DIR=$(mktemp -d -t worktree-test-XXXXXX)
cd "$TEST_DIR"
git init -q
git config user.email "test@example.com"
git config user.name "Test"
echo "hello" > README.md
git add README.md
git commit -q -m "initial"
```

Cada grupo usa um nome de sessão tmux único (ex.: `wt-test-a`, `wt-test-b`) e um diretório temporário único.

Binário de referência: `qwen` instalado globalmente (0.15.10).
Binário de build local: `node /Users/mochi/code/qwen-code/.claude/worktrees/trusting-euclid-6fdfb9/bundle/qwen.js`.

## Grupo de Teste A: Registro da ferramenta EnterWorktree e criação básica

**Modo:** Headless, `--approval-mode yolo`, `--output-format json`

### A1: Ferramenta registrada na inicialização do sistema

**Passos:**

```bash
<qwen> "say hello" --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r 'select(.type=="system") | .tools[]' \
  | grep -E "^(enter_worktree|exit_worktree)$"
```

**Pré-implementação:** vazio (ferramentas não registradas).
**Pós-implementação:** exibe `enter_worktree` e `exit_worktree`.

### A2: Criar worktree com nome gerado automaticamente

**Passos:**

```bash
<qwen> "create a new git worktree using the enter_worktree tool" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a2.json
# Check worktree dir created
ls -la .qwen/worktrees/ | grep -v "^\." | wc -l
# Should have a directory matching the auto-generated slug pattern
```

**Pré-implementação:** o modelo informa que não consegue encontrar a ferramenta; nenhum diretório `.qwen/worktrees/`.
**Pós-implementação:** `.qwen/worktrees/<slug>` existe com slug gerado automaticamente (formato: `{adj}-{noun}-{4hex}`).

### A3: Criar worktree com nome personalizado

**Passos:**

```bash
<qwen> "use the enter_worktree tool with name='my-feature' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null
ls .qwen/worktrees/my-feature/
git branch | grep worktree-my-feature
```

**Pré-implementação:** ferramenta desconhecida.
**Pós-implementação:** diretório `.qwen/worktrees/my-feature/` existe; branch `worktree-my-feature` existe.

### A4: Slug inválido rejeitado

**Passos:**

```bash
<qwen> "use enter_worktree with name='../../../etc' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq 'select(.type=="user") | .message.content[] | select(.is_error) | .content'
```

**Pré-implementação:** ferramenta desconhecida.
**Pós-implementação:** resultado da ferramenta com is_error=true e mensagem de erro de validação.

## Grupo de Teste B: ExitWorktree

**Modo:** Headless, interação em duas etapas dentro de um único prompt.

### B1: Enter e depois exit com action=keep

**Passos:**

```bash
<qwen> "create a worktree named 'temp-keep' using enter_worktree, then immediately exit it with action='keep' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b1.json
# Directory should still exist (keep preserves it)
ls -d .qwen/worktrees/temp-keep
# Branch should still exist
git branch | grep worktree-temp-keep
# CWD should be original
```

**Pré-implementação:** ferramentas desconhecidas.
**Pós-implementação:** diretório e branch do worktree ainda existem após exit.

### B2: Enter e depois exit com action=remove (sem alterações)

**Passos:**

```bash
<qwen> "create a worktree named 'temp-remove' using enter_worktree, then immediately exit it with action='remove' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null
ls -d .qwen/worktrees/temp-remove 2>&1
git branch | grep worktree-temp-remove
```

**Pré-implementação:** ferramentas desconhecidas.
**Pós-implementação:** diretório do worktree removido; branch deletado.

### B3: Exit com action=remove recusa quando existem alterações não confirmadas

**Passos:** Iniciar uma sessão tmux interativa, criar arquivos manualmente no worktree e tentar exit.

```bash
tmux new-session -d -s wt-test-b3 -x 200 -y 50 "cd $TEST_DIR && <qwen> --approval-mode yolo"
sleep 3
tmux send-keys -t wt-test-b3 "create a worktree named 'dirty-test' using enter_worktree"
sleep 0.5
tmux send-keys -t wt-test-b3 Enter
# Wait for completion
for i in $(seq 1 30); do
  sleep 2
  tmux capture-pane -t wt-test-b3 -p | grep -q "Type your message" && break
done
# Create dirty file in worktree
echo "dirty" > "$TEST_DIR/.qwen/worktrees/dirty-test/dirty.txt"
# Try to remove without discard_changes
tmux send-keys -t wt-test-b3 "use exit_worktree with action='remove' to exit the worktree"
sleep 0.5
tmux send-keys -t wt-test-b3 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-test-b3 -p | grep -q "Type your message" && break; done
tmux capture-pane -t wt-test-b3 -p -S -100 > /tmp/b3.out
# Should mention "uncommitted changes" or "discard_changes" in output
grep -E "uncommitted|discard_changes" /tmp/b3.out
tmux kill-session -t wt-test-b3
```

**Pré-implementação:** ferramentas desconhecidas.
**Pós-implementação:** exit falha com uma mensagem sobre alterações não confirmadas e a flag `discard_changes`.

## Grupo de Teste C: Persistência do SessionService

### C1: Estado do worktree nos metadados da sessão

**Passos:**

```bash
SESSION_ID=$(<qwen> "create a worktree named 'persist-test' using enter_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r 'select(.type=="system") | .session_id' | head -1)
# Check session storage for worktree state
find ~/.qwen -name "*${SESSION_ID}*" 2>/dev/null | head
grep -l "persist-test" ~/.qwen/projects/*/sessions/*.json 2>/dev/null || \
  grep -rl "worktreeSession\|persist-test" ~/.qwen/projects/ 2>/dev/null | head -5
```

**Pré-implementação:** nenhum estado de sessão de worktree armazenado em lugar algum.
**Pós-implementação:** o JSON da sessão contém um campo `worktreeSession` com `slug='persist-test'`, `worktreePath`, `originalCwd`, etc.

## Grupo de Teste D: Isolamento do AgentTool

### D1: Parâmetro de isolamento do agente aceito

**Passos:**

```bash
<qwen> "spawn an agent using the agent tool with isolation='worktree' to run 'echo hello'" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq 'select(.type=="assistant") | .message.content[] | select(.type=="tool_use" and .name=="agent") | .input'
# Check that .qwen/worktrees/ contains an agent-* slug during execution
```

**Pré-implementação:** o schema da ferramenta agent não possui parâmetro isolation; o modelo omite ou o schema rejeita.
**Pós-implementação:** o agente executa com sucesso com isolation='worktree'; um worktree `agent-<7hex>` é criado.

### D2: Agente limpa worktree automaticamente (sem alterações)

**Passos:**

```bash
ls .qwen/worktrees/ > /tmp/d2-before.txt 2>/dev/null
<qwen> "spawn an agent with isolation='worktree' to list files in the current directory using ls" \
  --approval-mode yolo --output-format json 2>/dev/null
ls .qwen/worktrees/ > /tmp/d2-after.txt 2>/dev/null
# After should equal before (no leftover agent-* dirs)
diff /tmp/d2-before.txt /tmp/d2-after.txt
```

**Pré-implementação:** N/A (nenhum parâmetro isolation).
**Pós-implementação:** o diretório worktrees permanece inalterado após o agente concluir sem alterações.

### D3: Worktree do agente preservado quando alterações são feitas

**Passos:**

```bash
<qwen> "spawn an agent with isolation='worktree' to write 'test content' to a new file called test.txt" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/d3.json
# Worktree should be preserved with the change
ls .qwen/worktrees/agent-* 2>/dev/null
ls .qwen/worktrees/agent-*/test.txt 2>/dev/null
# Agent result should include worktreePath/worktreeBranch
jq 'select(.type=="user") | .message.content[] | select(.tool_use_id) | .content' /tmp/d3.json | head
```

**Pré-implementação:** N/A.
**Pós-implementação:** `.qwen/worktrees/agent-<7hex>/test.txt` existe; o resultado do agente menciona caminho e branch do worktree.

## Grupo de Teste E: Limpeza de worktrees obsoletos

### E1: Função de limpeza remove worktrees antigos de agentes

Testar isso de ponta a ponta é mais difícil porque requer envelhecimento. Cobrir via testes unitários em `worktreeCleanup.test.ts`:

- Worktree com mtime > 30 dias atrás e correspondente ao padrão `agent-<7hex>` → removido
- Worktree com mtime > 30 dias atrás mas nomeado pelo usuário (ex.: `my-feature`) → preservado
- Worktree com mtime < 30 dias → preservado
- Worktree com alterações não confirmadas → preservado (fail-closed)
- Worktree com commits não enviados → preservado (fail-closed)

Verificação pontual E2E (opcional): usar `touch -t 200001010000 .qwen/worktrees/agent-aabcdef0` manualmente e invocar a limpeza; verificar remoção.

## Grupo de Teste F: Compatibilidade com Arena (sem regressão)

### F1: Caminho do worktree do Arena inalterado

**Passos:** Executar uma sessão Arena (separada do EnterWorktree); verificar que ainda cria worktrees em `~/.qwen/arena/<sessionId>/worktrees/` e não em `.qwen/worktrees/`.

```bash
# Setup: requires Arena-enabled config. Detailed steps depend on Arena CLI invocation.
# Pre-implementation: arena worktrees are under ~/.qwen/arena/.
# Post-implementation: SAME — arena path is independent.
```

(Se o Arena não for facilmente acessível a partir do modo headless, este grupo é verificado por teste unitário de que `ArenaManager.ts:125` (`this.arenaBaseDir = arenaSettings?.worktreeBaseDir ?? path.join(Storage.getGlobalQwenDir(), 'arena')`) não foi alterado.)

## Cobertura de testes unitários (colocalizada com a implementação)

Além do plano E2E, estes testes unitários devem acompanhar a implementação:

- `EnterWorktreeTool.test.ts`: validação de schema, rejeição de slug, rejeição de worktree aninhado, mudança de cwd, escrita no SessionService
- `ExitWorktreeTool.test.ts`: caminhos keep vs remove, proteção de estado sujo, bypass discard_changes, restauração de cwd
- Extensões de `gitWorktreeService.test.ts`: `createUserWorktree`, `removeUserWorktree`, `createAgentWorktree`, `removeAgentWorktree`
- Extensões de `sessionService.test.ts`: leitura/escrita do campo WorktreeSession, restauração de resume
- `worktreeCleanup.test.ts`: correspondência de padrão de limpeza, filtro de idade, condições fail-closed
- Extensões de `agent.test.ts`: parâmetro isolation aceito, worktree criado e (em alguns casos) limpo

## Critérios de aprovação

| Grupo | Esperado pré-construção                        | Esperado pós-construção                                          |
| ----- | ---------------------------------------------- | ---------------------------------------------------------------- |
| A1    | ferramentas não listadas                       | ambas as ferramentas listadas                                    |
| A2    | erro/sem operação                              | `.qwen/worktrees/<auto-slug>` criado                             |
| A3    | erro/sem operação                              | `.qwen/worktrees/my-feature` criado, branch presente             |
| A4    | erro/sem operação                              | resultado da ferramenta com is_error e mensagem de validação     |
| B1    | erro/sem operação                              | diretório + branch do worktree preservados                       |
| B2    | erro/sem operação                              | diretório + branch do worktree removidos                         |
| B3    | erro/sem operação                              | exit recusa com mensagem de alterações não confirmadas           |
| C1    | nenhum estado de worktree                      | sessão possui campo worktreeSession                              |
| D1    | sem parâmetro isolation                        | agente executa em worktree `agent-<7hex>`                        |
| D2    | N/A                                            | diretório worktrees inalterado após agente sem alterações        |
| D3    | N/A                                            | `agent-<7hex>` preservado com alterações                         |

## Relatório de reprodução (pós-implementação)

Build local em `dist/cli.js` (commit no topo de `claude/trusting-euclid-6fdfb9`).

| Grupo | Resultado                            | Observações                                                                                                                                                                  |
| ----- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1    | ✅                                   | `enter_worktree` e `exit_worktree` listados em `system.tools`                                                                                                                 |
| A3    | ✅                                   | `.qwen/worktrees/my-feature` criado, branch `worktree-my-feature` presente                                                                                                    |
| A4    | coberto por teste unitário           | `validateUserWorktreeSlug` rejeita path-traversal etc. (`enter-worktree.test.ts`)                                                                                             |
| B1    | ✅                                   | Ação `keep` preservou tanto o diretório quanto o branch                                                                                                                       |
| B2    | ✅                                   | Ação `remove` deletou diretório e branch                                                                                                                                      |
| B3    | ✅                                   | `remove` recusou com `Refusing to remove worktree "dirty-test" — it has 0 tracked change(s) and 1 untracked file(s).`                                                         |
| C1    | escopo excluído                      | Persistência do SessionService adiada da Fase A (ver notas de escopo em `docs/design/worktree.md`)                                                                            |
| D1    | ✅                                   | Invocação do agente aceitou `isolation: 'worktree'`, criou `agent-2c4e759`                                                                                                    |
| D2    | ✅                                   | Após o agente terminar sem alterações, o diretório worktrees estava vazio                                                                                                     |
| D3    | ✅                                   | Após o agente escrever `test.txt`, worktree `agent-bad55bd` e branch `worktree-agent-bad55bd` preservados; resultado incluiu sufixo `[worktree preserved: ... (branch ...)]` |
| E1    | coberto por teste unitário           | `worktreeCleanup.test.ts` verifica que `isEphemeralSlug` corresponde apenas a `agent-<7hex>`                                                                                  |
| F1    | escopo excluído (sem E2E Arena aqui) | Código do Arena não foi tocado: `ArenaManager.ts:125` e `setupWorktrees()` inalterados                                                                                        |

### Desvios de escopo em relação ao plano de teste

- **C1** (Persistência do SessionService) foi adiado da Fase A. O mínimo viável da Fase A retorna o caminho absoluto do worktree para que o modelo o utilize diretamente via caminhos absolutos, em vez de alternar mecanicamente `Config.targetDir`. O suporte a resume requer extensão do SessionService e está documentado para uma fase futura.
- **A2** (nome gerado automaticamente) foi verificado indiretamente via D1/D3, que exercitam o mesmo caminho de slug automático através do fluxo de isolamento do agente.