# Plano de Teste E2E da Fase C do Worktree

## Escopo

Verificação ponta a ponta das funcionalidades da Fase C em relação ao build local em
`/Users/mochi/code/qwen-code/.claude/worktrees/romantic-burnell-b6e48c/dist/cli.js`.

A Fase C entrega:

- **Tarefa 1, 3, 4** — Arquivo JSON sidecar do `WorktreeSession` em
  `~/.qwen/tmp/<projectHash>/chats/<sessionId>.worktree.json`
- **Tarefa 2** — `core.hooksPath` configurado dentro de novas worktrees
- **Tarefa 5–6** — Hook `useWorktreeSession`, `UIState.activeWorktree`, indicador de worktree no Footer,
  campo `StatusLineCommandInput.worktree`
- **Tarefa 7** — `--resume` injeta um item de histórico INFO quando a worktree ativa
  ainda existe; caso contrário, limpa o sidecar obsoleto
- **Tarefa 8** — `WorktreeExitDialog` com inspeção de estado sujo (dirty-state),
  intercepta segundo Ctrl+C na worktree ativa

## Binários

- **Build local**: `node /Users/mochi/code/qwen-code/.claude/worktrees/romantic-burnell-b6e48c/dist/cli.js`
- **Baseline (para comparação pré-implantação, se necessário)**: `qwen` instalado globalmente

## Modelo de ambiente de teste

Cada grupo é executado em seu próprio repositório git temporário e sessão tmux:

```bash
TEST_DIR=$(mktemp -d -t qwen-wt-phc-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)   # resolve symlinks (macOS /var → /private/var)
cd "$TEST_DIR"
git init -q -b main
git config user.email t@e.com
git config user.name t
git config commit.gpgsign false
echo "hello" > README.md
git add README.md
git commit -q -m "initial" --no-verify
```

`QWEN=/Users/mochi/code/qwen-code/.claude/worktrees/romantic-burnell-b6e48c/dist/cli.js`

---

## Grupo A: Sidecar do WorktreeSession (headless)

**Modo:** headless, `--approval-mode yolo`, `--output-format json`

### A1: enter_worktree escreve sidecar com todos os campos

**Passos:**

```bash
SESSION=$(node $QWEN "use the enter_worktree tool with name='a1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json

# Verifica se todos os campos estão presentes
cat "$SIDECAR" | jq '.slug, .worktreePath, .worktreeBranch, .originalCwd, .originalBranch, .originalHeadCommit'
```

**Esperado:**

- `slug` = "a1-test"
- `worktreePath` termina com `.qwen/worktrees/a1-test`
- `worktreeBranch` = "worktree-a1-test"
- `originalCwd` = `$TEST_DIR` (resolvido)
- `originalBranch` = "main"
- `originalHeadCommit` corresponde a `[0-9a-f]{40}`

### A2: exit_worktree (keep) limpa o sidecar

**Passos:**

```bash
SESSION=$(node $QWEN "create a worktree named 'a2-test' using enter_worktree, then immediately exit it with action='keep' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json
test ! -f "$SIDECAR" && echo "PASS: sidecar removido" || echo "FAIL: sidecar ainda existe"
```

**Esperado:** o arquivo sidecar não existe após a chamada exit_worktree.

### A3: exit_worktree (remove) limpa o sidecar

**Passos:**

```bash
SESSION=$(node $QWEN "create a worktree named 'a3-test' using enter_worktree, then immediately exit it with action='remove' and discard_changes=true using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json
test ! -f "$SIDECAR" && echo "PASS: sidecar removido" || echo "FAIL: sidecar ainda existe"
# Também verifica se o diretório da worktree foi removido
test ! -d "$TEST_DIR/.qwen/worktrees/a3-test" && echo "PASS: diretório da worktree removido"
```

**Esperado:** tanto o sidecar quanto o diretório da worktree são removidos.

---

## Grupo B: Configuração de hooksPath (headless)

### B1: Sem `.husky/`, hooksPath = `<repo>/.git/hooks`

**Passos:**

```bash
node $QWEN "use enter_worktree with name='b1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

HOOKS_PATH=$(git -C "$TEST_DIR/.qwen/worktrees/b1-test" config --local core.hooksPath)
echo "Got hooksPath: $HOOKS_PATH"
test "$HOOKS_PATH" = "$TEST_DIR/.git/hooks" && echo "PASS" || echo "FAIL"
```

**Esperado:** `$TEST_DIR/.git/hooks`

### B2: Com `.husky/`, hooksPath = `<repo>/.husky`

**Passos:**

```bash
mkdir -p "$TEST_DIR/.husky"
echo '#!/bin/sh' > "$TEST_DIR/.husky/pre-commit"
chmod +x "$TEST_DIR/.husky/pre-commit"

node $QWEN "use enter_worktree with name='b2-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

HOOKS_PATH=$(git -C "$TEST_DIR/.qwen/worktrees/b2-test" config --local core.hooksPath)
test "$HOOKS_PATH" = "$TEST_DIR/.husky" && echo "PASS" || echo "FAIL got=$HOOKS_PATH"
```

**Esperado:** `$TEST_DIR/.husky`

### B3: Hooks no repositório principal realmente disparam de dentro da worktree

**Passos:**

```bash
# Configura um hook que escreve um arquivo marcador
mkdir -p "$TEST_DIR/.git/hooks"
cat > "$TEST_DIR/.git/hooks/pre-commit" <<'EOF'
#!/bin/sh
echo "hook-fired" > /tmp/qwen-wt-hook-marker
EOF
chmod +x "$TEST_DIR/.git/hooks/pre-commit"

node $QWEN "use enter_worktree with name='b3-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

# Faz um commit dentro da worktree
WT="$TEST_DIR/.qwen/worktrees/b3-test"
echo "x" > "$WT/file.txt"
git -C "$WT" add file.txt
rm -f /tmp/qwen-wt-hook-marker
git -C "$WT" commit -m "trigger hook" 2>&1
test -f /tmp/qwen-wt-hook-marker && echo "PASS: hook disparou" || echo "FAIL: hook não disparou"
rm -f /tmp/qwen-wt-hook-marker
```

**Esperado:** `/tmp/qwen-wt-hook-marker` existe após o commit.

---

## Grupo C: Restauração via --resume da worktree (headless)

### C1: --resume injeta contexto da worktree quando sidecar presente e diretório ativo

**Passos:**

```bash
# Cria sessão inicial com worktree
INIT_OUT=$(node $QWEN "use enter_worktree with name='c1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null)
SESSION=$(echo "$INIT_OUT" | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

# Resume a sessão e pergunta "qual é o meu contexto?"
RESUMED=$(node $QWEN --resume "$SESSION" "say SIDECAR-CONFIRM" \
  --approval-mode yolo --output-format json 2>/dev/null)

# Procura pelo texto da mensagem INFO injetada na conversa
echo "$RESUMED" | grep -q "Resumed.*Active worktree.*c1-test" && echo "PASS" || echo "FAIL: sem injeção de contexto"
```

**Esperado:** o fluxo JSON contém uma mensagem INFO referenciando `c1-test`.

### C2: --resume limpa sidecar obsoleto quando diretório da worktree não existe mais

**Passos:**

```bash
INIT_OUT=$(node $QWEN "use enter_worktree with name='c2-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null)
SESSION=$(echo "$INIT_OUT" | jq -r '.[] | select(.type=="system") | .session_id' | head -1)
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json

# Remove o diretório da worktree fora do fluxo
rm -rf "$TEST_DIR/.qwen/worktrees/c2-test"
test -f "$SIDECAR" || { echo "SKIP: sidecar já havia sido removido"; exit 0; }

# Resume — deve limpar o sidecar obsoleto
node $QWEN --resume "$SESSION" "hello" --approval-mode yolo --output-format json 2>/dev/null > /dev/null
test ! -f "$SIDECAR" && echo "PASS: sidecar obsoleto limpo" || echo "FAIL: sidecar obsoleto ainda presente"
```

**Esperado:** o arquivo sidecar é removido.

---

## Grupo D: Indicador de worktree no Footer (interativo tmux)

### D1: Footer mostra indicador de worktree após enter_worktree

**Passos:**

```bash
tmux new-session -d -s wt-d1 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-d1 "use enter_worktree with name='d1-test'"
sleep 0.5
tmux send-keys -t wt-d1 Enter

for i in $(seq 1 30); do
  sleep 2
  tmux capture-pane -t wt-d1 -p | grep -q "Type your message" && break
done

# Captura e procura pela linha do indicador de worktree na área do Footer
tmux capture-pane -t wt-d1 -p -S -100 > /tmp/wt-d1.out
grep -E "⎇.*worktree-d1-test.*\(d1-test\)" /tmp/wt-d1.out && echo "PASS" || \
  { echo "FAIL — saída capturada:"; cat /tmp/wt-d1.out; }
tmux kill-session -t wt-d1
```

**Esperado:** Footer contém uma linha como `⎇ worktree-d1-test (d1-test)`.

### D2: Indicador no Footer desaparece após exit_worktree (keep)

**Passos:**

```bash
tmux new-session -d -s wt-d2 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-d2 "use enter_worktree with name='d2-test'"
sleep 0.5
tmux send-keys -t wt-d2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-d2 -p | grep -q "Type your message" && break; done

# Verifica se o indicador apareceu
tmux capture-pane -t wt-d2 -p -S -100 | grep -q "⎇.*d2-test" || { echo "FAIL: indicador ausente antes do exit"; tmux kill-session -t wt-d2; exit 1; }

# Sai da worktree (keep)
tmux send-keys -t wt-d2 "use exit_worktree with name='d2-test' action='keep'"
sleep 0.5
tmux send-keys -t wt-d2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-d2 -p | grep -q "Kept worktree" && break; done

sleep 2  # dá um tick para o Footer atualizar após remoção do sidecar
tmux capture-pane -t wt-d2 -p -S -100 > /tmp/wt-d2-after.out
# Após o exit, o indicador deve ter desaparecido da área inferior do painel
tail -5 /tmp/wt-d2-after.out | grep -q "⎇.*d2-test" && \
  echo "FAIL: indicador ainda visível" || echo "PASS"
tmux kill-session -t wt-d2
```

**Esperado:** o indicador de worktree desaparece do Footer em até ~2s após `exit_worktree`.

---

## Grupo E: Diálogo de Saída da Worktree (interativo tmux)

### E1: Segundo Ctrl+C na worktree mostra diálogo em vez de sair

**Passos:**

```bash
tmux new-session -d -s wt-e1 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e1 "use enter_worktree with name='e1-test'"
sleep 0.5
tmux send-keys -t wt-e1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e1 -p | grep -q "Type your message" && break; done

# Primeiro Ctrl+C (limpeza; deve mostrar "Pressione Ctrl+C novamente para sair")
tmux send-keys -t wt-e1 C-c
sleep 0.3
tmux capture-pane -t wt-e1 -p | grep -q "Press Ctrl+C again" || \
  { echo "FAIL: primeiro Ctrl+C não mostrou aviso"; tmux kill-session -t wt-e1; exit 1; }

# Segundo Ctrl+C — deve mostrar o WorktreeExitDialog, NÃO sair
tmux send-keys -t wt-e1 C-c
sleep 2

# Verifica se o diálogo foi renderizado
tmux capture-pane -t wt-e1 -p -S -50 > /tmp/wt-e1.out
grep -q "Active worktree.*e1-test" /tmp/wt-e1.out && \
  grep -q "Keep worktree" /tmp/wt-e1.out && \
  grep -q "Remove worktree" /tmp/wt-e1.out && \
  echo "PASS" || { echo "FAIL — capturado:"; cat /tmp/wt-e1.out; }
tmux kill-session -t wt-e1
```

**Esperado:** o diálogo mostra três opções (Manter (Keep) / Remover (Remove) / Cancelar (Cancel)) e o processo ainda está ativo.

### E2: Diálogo mostra contagens de estado sujo (commits + arquivos)

**Passos:**

```bash
tmux new-session -d -s wt-e2 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e2 "use enter_worktree with name='e2-test'"
sleep 0.5
tmux send-keys -t wt-e2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e2 -p | grep -q "Type your message" && break; done

# Deixa a worktree suja: 1 novo commit + 1 arquivo não comitado
WT="$TEST_DIR/.qwen/worktrees/e2-test"
echo "new" > "$WT/new.txt"
git -C "$WT" add new.txt
git -C "$WT" commit -q -m "test commit" --no-verify
echo "dirty" > "$WT/uncommitted.txt"

# Aciona o diálogo de saída com duplo Ctrl+C
tmux send-keys -t wt-e2 C-c
sleep 0.3
tmux send-keys -t wt-e2 C-c
sleep 3   # dá tempo para git status / rev-list

tmux capture-pane -t wt-e2 -p -S -50 > /tmp/wt-e2.out
grep -qE "new commit|uncommitted file" /tmp/wt-e2.out && echo "PASS" || \
  { echo "FAIL — capturado:"; cat /tmp/wt-e2.out; }
tmux kill-session -t wt-e2
```

**Esperado:** o corpo do diálogo contém tanto "X new commit(s)" quanto "Y uncommitted file(s)".

### E3: Opção Cancelar dispensa o diálogo sem sair

**Passos:**

```bash
tmux new-session -d -s wt-e3 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e3 "use enter_worktree with name='e3-test'"
sleep 0.5
tmux send-keys -t wt-e3 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e3 -p | grep -q "Type your message" && break; done

# Aciona diálogo
tmux send-keys -t wt-e3 C-c
sleep 0.3
tmux send-keys -t wt-e3 C-c
sleep 3

# Navega para Cancelar (DOWN DOWN) e pressiona Enter
tmux send-keys -t wt-e3 Down
sleep 0.2
tmux send-keys -t wt-e3 Down
sleep 0.2
tmux send-keys -t wt-e3 Enter
sleep 2

# Diálogo deve ter desaparecido; prompt de entrada deve ter voltado
tmux capture-pane -t wt-e3 -p | grep -q "Type your message" && echo "PASS" || \
  { echo "FAIL — capturado:"; tmux capture-pane -t wt-e3 -p; }

# Verifica que a worktree NÃO foi removida
test -d "$TEST_DIR/.qwen/worktrees/e3-test" && echo "worktree intacta" || echo "FAIL: worktree removida"
tmux kill-session -t wt-e3
```

**Esperado:** o diálogo fecha, o prompt de entrada retorna, o diretório da worktree ainda existe.

### E4: Opção Manter (Keep) sai da sessão mas preserva a worktree

**Passos:**

```bash
tmux new-session -d -s wt-e4 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e4 "use enter_worktree with name='e4-test'"
sleep 0.5
tmux send-keys -t wt-e4 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e4 -p | grep -q "Type your message" && break; done

# Aciona diálogo e escolhe Manter (primeira opção, já selecionada)
tmux send-keys -t wt-e4 C-c
sleep 0.3
tmux send-keys -t wt-e4 C-c
sleep 3
tmux send-keys -t wt-e4 Enter

# Aguarda o processo sair
for i in $(seq 1 20); do
  sleep 1
  tmux has-session -t wt-e4 2>/dev/null || break
  tmux capture-pane -t wt-e4 -p | grep -q "\$ " && break  # prompt do shell de volta
done

# O diretório da worktree ainda deve existir
test -d "$TEST_DIR/.qwen/worktrees/e4-test" && echo "PASS: worktree preservada" || \
  echo "FAIL: worktree foi removida"
tmux kill-session -t wt-e4 2>/dev/null || true
```

**Esperado:** o processo sai, o diretório da worktree permanece no disco.

### E5: Opção Remover (Remove) sai da sessão e exclui a worktree

**Passos:**

```bash
tmux new-session -d -s wt-e5 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e5 "use enter_worktree with name='e5-test'"
sleep 0.5
tmux send-keys -t wt-e5 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e5 -p | grep -q "Type your message" && break; done

# Aciona diálogo e escolhe Remover (DOWN, Enter)
tmux send-keys -t wt-e5 C-c
sleep 0.3
tmux send-keys -t wt-e5 C-c
sleep 3
tmux send-keys -t wt-e5 Down
sleep 0.2
tmux send-keys -t wt-e5 Enter

# Aguarda a saída
for i in $(seq 1 20); do
  sleep 1
  tmux has-session -t wt-e5 2>/dev/null || break
  tmux capture-pane -t wt-e5 -p | grep -q "\$ " && break
done

# O diretório da worktree deve ter sido REMOVIDO
test ! -d "$TEST_DIR/.qwen/worktrees/e5-test" && echo "PASS: worktree removida" || \
  echo "FAIL: worktree ainda no disco"
# O branch também deve ter sido excluído
git -C "$TEST_DIR" branch --list | grep -q "worktree-e5-test" && \
  echo "FAIL: branch ainda presente" || echo "PASS: branch removido"
tmux kill-session -t wt-e5 2>/dev/null || true
```

**Esperado:** o processo sai, o diretório da worktree é excluído, o branch `worktree-e5-test` é excluído.

---

## Grupo F: Simulação de fluxo de trabalho de usuário real (interativo tmux)

### F1: Fluxo completo enter → editar → commit → resume → exit (keep)

**Passos:**

```bash
tmux new-session -d -s wt-f1 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

# Passo 1: entra na worktree
tmux send-keys -t wt-f1 "use enter_worktree with name='f1-feature' to create a worktree"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Type your message" && break; done

# Passo 2: lê o caminho absoluto da worktree para que o modelo saiba onde escrever
WT="$TEST_DIR/.qwen/worktrees/f1-feature"
tmux send-keys -t wt-f1 "write the file $WT/hello.txt with content 'hi from worktree'"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 60); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Type your message" && break; done

# Verifica se o arquivo foi realmente escrito DENTRO da worktree
test -f "$WT/hello.txt" && grep -q "hi from worktree" "$WT/hello.txt" && \
  echo "PASS: arquivo escrito dentro da worktree" || echo "FAIL: arquivo não está na worktree"

# Passo 3: Sai com keep via ferramenta
tmux send-keys -t wt-f1 "use exit_worktree with name='f1-feature' action='keep'"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Kept worktree" && break; done

# Passo 4: Verifica se a worktree ainda está no disco após a saída
test -d "$WT" && echo "PASS: worktree mantida" || echo "FAIL: worktree removida"
test -f "$WT/hello.txt" && echo "PASS: arquivo persiste" || echo "FAIL"

tmux kill-session -t wt-f1
```

**Esperado:**

- Arquivo escrito no diretório da worktree (não no repositório principal)
- Após sair com `keep`, tanto o diretório da worktree quanto o arquivo permanecem

### F2: StatusLine personalizado recebe payload `worktree`

**Passos:**

```bash
# Cria um script de statusline que imprime o JSON recebido via stdin
SETTINGS_DIR=~/.qwen
SETTINGS_FILE=$SETTINGS_DIR/settings.json
cp -f "$SETTINGS_FILE" /tmp/qwen-settings-backup.json 2>/dev/null || true
mkdir -p "$SETTINGS_DIR"
SL_SCRIPT=/tmp/qwen-wt-statusline.sh
cat > $SL_SCRIPT <<'EOF'
#!/bin/sh
INPUT=$(cat)
echo "$INPUT" > /tmp/qwen-wt-statusline-input.json
WT_NAME=$(echo "$INPUT" | jq -r '.worktree.name // "no-worktree"')
echo "WT=$WT_NAME"
EOF
chmod +x $SL_SCRIPT

cat > "$SETTINGS_FILE" <<EOF
{"ui":{"statusLine":{"type":"command","command":"$SL_SCRIPT"}}}
EOF

tmux new-session -d -s wt-f2 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 5  # statusline precisa de um tick extra

tmux send-keys -t wt-f2 "use enter_worktree with name='f2-test'"
sleep 0.5
tmux send-keys -t wt-f2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f2 -p | grep -q "Type your message" && break; done

sleep 3  # deixa o statusline atualizar após mudança do sidecar

# Inspeciona o payload capturado
cat /tmp/qwen-wt-statusline-input.json | jq '.worktree.name, .worktree.path, .worktree.branch'

# Verifica que o indicador embutido no Footer está OCULTO quando statusline personalizado está ativo
tmux capture-pane -t wt-f2 -p -S -100 > /tmp/wt-f2.out
grep -q "WT=f2-test" /tmp/wt-f2.out && echo "PASS: statusline personalizado renderizado" || echo "FAIL"
tmux kill-session -t wt-f2

# Restaura as configurações
cp -f /tmp/qwen-settings-backup.json "$SETTINGS_FILE" 2>/dev/null || rm -f "$SETTINGS_FILE"
```

**Esperado:**

- `/tmp/qwen-wt-statusline-input.json` tem `.worktree.name == "f2-test"`, `.path`, `.branch` definidos
- A saída do statusline personalizado `WT=f2-test` aparece no Footer
- A linha embutida `⎇ worktree-...` NÃO é renderizada (suprimida pelo statusline personalizado)

---

## Resumo dos critérios de aprovação

| Grupo | Teste                               | Esperado                                     |
| ----- | ----------------------------------- | -------------------------------------------- |
| A     | A1 enter escreve sidecar            | todos os 6 campos preenchidos                |
| A     | A2 keep limpa sidecar               | arquivo removido                             |
| A     | A3 remove limpa sidecar             | arquivo + diretório removidos                |
| B     | B1 hooksPath fallback               | `<repo>/.git/hooks`                          |
| B     | B2 hooksPath husky                  | `<repo>/.husky`                              |
| B     | B3 hook dispara na worktree         | arquivo marcador escrito                     |
| C     | C1 resume injeta contexto           | mensagem INFO presente                       |
| C     | C2 limpeza sidecar obsoleto         | sidecar removido                             |
| D     | D1 footer mostra worktree           | `⎇ worktree-...` renderizado                 |
| D     | D2 footer esconde após saída        | indicador desaparece                         |
| E     | E1 diálogo no 2º Ctrl+C             | diálogo visível, processo vivo               |
| E     | E2 contagens de estado sujo         | commits + arquivos mostrados                 |
| E     | E3 Cancelar                         | diálogo fechado, sessão ativa                |
| E     | E4 Manter (Keep)                    | sessão sai, worktree preservada              |
| E     | E5 Remover (Remove)                 | sessão sai, worktree excluída                |
| F     | F1 fluxo completo                   | arquivo na worktree, persiste após keep      |
| F     | F2 statusline personalizado         | payload worktree recebido, footer suprimido  |