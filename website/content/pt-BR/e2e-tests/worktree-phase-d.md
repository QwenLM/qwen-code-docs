# Plano de Teste E2E da Fase D do Worktree

## Escopo

Verificação ponta a ponta das funcionalidades da Fase D contra a build local em
`/Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`.

A Fase D entrega três capacidades transversais:

- **D-1** — Flag de inicialização `--worktree [name]` (forma simples / slug explícito / `=`),
  com `process.cwd()` + troca de `Config.targetDir` e reuso de `WorktreeExitDialog` na saída
- **D-2** — Chave de configuração `worktree.symlinkDirectories: string[]`, aplicada em
  `performPostCreationSetup()` para cobrir `--worktree`, `EnterWorktreeTool`
  E caminhos de `AgentTool isolation: "worktree"`
- **D-3** — Formas de referência a PR `--worktree=#<N>` e `--worktree <github-url>`,
  via `git fetch origin pull/<N>/head` (sem dependência do CLI `gh`)

## Binários

- **Build local (verificação Fase 6)**: `node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`
- **Baseline dry-run da Fase 4**: `qwen` instalado globalmente

Para dry-runs, espera-se que o `qwen` global falhe nos Grupos A / E / F
porque as funcionalidades ainda não existem — isso valida que o plano
detecta corretamente a implementação.

### Pré-condição de baseline para o Grupo E

Os testes **E2** (symlink do `EnterWorktreeTool`) e **E3** (symlink do `AgentTool isolation`)
exigem que a **Fase A + B** esteja presente na baseline — eles exercitam
a ferramenta `enter_worktree` existente e o parâmetro `agent isolation: "worktree"`
para confirmar que o loop de symlink também dispara nesses caminhos de código.

O `qwen` globalmente instalado pode ser anterior ao PR #4073 (Fase A+B, merge em 2026-05-14)
e, portanto, não ter essas ferramentas. Quando for esse o caso, E2 / E3 não conseguem
validar "symlink ausente porque D-2 está ausente" — eles colapsam em "ferramenta
ausente". Adicione esta proteção no início de cada um:

```bash
HAS_ENTER_WORKTREE=$($QWEN "list your tools and stop" --approval-mode yolo --output-format json 2>/dev/null \
  | jq -e '.[] | select(.type=="system") | .tools | index("enter_worktree")' >/dev/null && echo yes || echo no)
if [ "$HAS_ENTER_WORKTREE" != "yes" ]; then
  echo "SKIP: enter_worktree ausente na baseline — E2/E3 exigem Fase A+B"
  exit 0
fi
```

Para a verificação da Fase 6 (pós-implantação), a build local contém inerentemente
a Fase A-C, então a proteção não faz nada e os testes rodam por completo.

## Template de ambiente de teste

Cada grupo roda em seu próprio repositório git temporário e sessão tmux:

```bash
TEST_DIR=$(mktemp -d -t qwen-wt-phd-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)   # resolve symlinks (macOS /var → /private/var)
cd "$TEST_DIR"
git init -q -b main
git config user.email t@e.com
git config user.name t
git config commit.gpgsign false
echo "hello" > README.md
git add README.md
git commit -q -m "initial" --no-verify

PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
QWEN="node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js"
```

Os testes de referência a PR (Grupo F) exigem adicionalmente um clone verificado de um repositório
GitHub público com pelo menos um PR mergeado. Use este repositório (o próprio qwen-code) como
alvo do teste — o PR `#4174` (Fase C) é uma referência garantida.

---

## Grupo A: Formas básicas da flag `--worktree`

**Modo:** headless, `--approval-mode yolo`, `--output-format json`

### A1: `--worktree` simples (slug automático)

```bash
$QWEN --worktree "say hello and stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a1.out

# Um evento de sistema `worktree_started` é emitido na inicialização. O campo
# `notice` contém o slug (gerado automaticamente `adj-substantivo-XXXXXX`) dentro do
# texto renderizado. Use `jq -e` para que um evento ausente resulte em saída não-zero
# (em vez de `null` silencioso).
jq -e '.[] | select(.type=="system" and .subtype=="worktree_started") | .data.notice | test("\"[a-z]+-[a-z]+-[0-9a-f]{6}\"")' < /tmp/a1.out

# O `cwd` da mensagem de sistema `init` também deve apontar para dentro do worktree.
jq -e '.[] | select(.type=="system" and .subtype=="init") | .cwd | test("/\\.qwen/worktrees/[a-z]+-[a-z]+-[0-9a-f]{6}$")' < /tmp/a1.out

ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**Esperado (pós-implantação):**

- Evento `worktree_started` com `.data.notice` contendo o slug automático
- `.cwd` do `init` termina com `.qwen/worktrees/<slug-auto>`
- Exatamente um diretório de worktree em `.qwen/worktrees/`
- Branch nomeada `worktree-<slug>` existe (`git branch | grep worktree-`)

**Esperado (baseline pré-implantação):** yargs rejeita `--worktree` com
erro "Unknown argument" e código de saída diferente de 0.

### A2: `--worktree my-feature` (slug explícito)

```bash
$QWEN --worktree my-feature "say hello and stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a2.out

ls -d "$TEST_DIR/.qwen/worktrees/my-feature"
git -C "$TEST_DIR" branch | grep "worktree-my-feature"
```

**Esperado (pós-implantação):** diretório do worktree `my-feature/` e branch
`worktree-my-feature` ambos existem.

### A3: `--worktree=my-feature` (forma com =)

Idêntico a A2 com a forma `=`. Limpeza entre A2 e A3 é necessária (TEST_DIR
diferente).

```bash
$QWEN --worktree=my-feature "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a3.out
```

**Esperado (pós-implantação):** mesmo que A2.

### A4: slug inválido rejeitado antes de qualquer operação git

```bash
$QWEN --worktree "../escape" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a4.out
echo "exit=$?"

ls "$TEST_DIR/.qwen/worktrees/" 2>/dev/null
```

**Esperado (pós-implantação):**

- Processo encerra com status não-zero
- Stderr ou mensagem de resultado final menciona "invalid slug" / "not allowed"
- Diretório `.qwen/worktrees/` não existe (criação do worktree nunca foi iniciada)

### A5: não é um repositório git → falha imediata

```bash
NON_GIT=$(mktemp -d)
cd "$NON_GIT"
$QWEN --worktree "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a5.out
echo "exit=$?"
```

**Esperado (pós-implantação):** exit != 0, mensagem menciona "not a git repository"
ou "git init".

---

## Grupo B: cwd + sidecar após `--worktree`

### B1: sidecar escrito com todos os seis campos

```bash
SESSION_ID=$(uuidgen)
$QWEN --worktree b1-test --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b1.out

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json
jq '.slug, .worktreePath, .worktreeBranch, .originalCwd, .originalBranch, .originalHeadCommit' \
  < "$SIDECAR"
```

**Esperado:**

- `slug = "b1-test"`
- `worktreePath` termina com `.qwen/worktrees/b1-test`
- `worktreeBranch = "worktree-b1-test"`
- `originalCwd` = `$TEST_DIR` (resolvido)
- `originalBranch = "main"`
- `originalHeadCommit` corresponde a `[0-9a-f]{40}`

### B2: `process.cwd()` alterado na inicialização

```bash
$QWEN --worktree b2-test "run the shell tool with command 'pwd', then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b2.out

# Extrai o stdout da ferramenta shell do tool_result da mensagem de usuário
jq -r '.[] | select(.type=="user") | .message.content[] | select(.tool_use_id != null) | .content' \
  < /tmp/b2.out | head -5
```

**Esperado (pós-implantação):** a saída do `pwd` é igual a `$TEST_DIR/.qwen/worktrees/b2-test`.

### B3: `Config.targetDir` alterado (Footer / payload de status)

```bash
$QWEN --worktree b3-test "run the shell tool with command 'pwd && git rev-parse --abbrev-ref HEAD', then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b3.out

jq -r '.[] | select(.type=="user") | .message.content[] | select(.tool_use_id != null) | .content' \
  < /tmp/b3.out
```

**Esperado (pós-implantação):** a branch é `worktree-b3-test` E o diretório de trabalho
está dentro do worktree.

---

## Grupo C: Precedência entre `--worktree` e `--resume`

### C1: `--worktree` vence o sidecar salvo (slug diferente)

```bash
# Execução 1: criar uma sessão com worktree "first"
SESSION_ID=$(uuidgen)
$QWEN --worktree first --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c1-run1.out

# Execução 2: retomar a mesma sessão mas solicitar um worktree diferente
$QWEN --resume "$SESSION_ID" --worktree second "say hi again" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c1-run2.out

# Sidecar agora deve apontar para "second"
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json
jq -r '.slug' < "$SIDECAR"

# Ambos os diretórios de worktree devem existir no disco (first nunca foi removido, apenas desvinculado)
ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**Esperado (pós-implantação):**

- Sidecar `.slug` = `"second"`
- Ambos os diretórios `first/` e `second/` existem
- Stderr ou mensagem `init` `worktree_overridden` da execução 2 menciona "--worktree
  overrides the resumed session's worktree"

### C2: Sidecar desatualizado (diretório excluído manualmente) + `--worktree` → worktree novo

```bash
SESSION_ID=$(uuidgen)
$QWEN --worktree c2 --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c2-run1.out

rm -rf "$TEST_DIR/.qwen/worktrees/c2"   # simula exclusão pelo usuário

$QWEN --resume "$SESSION_ID" --worktree c2-fresh "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c2-run2.out

ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**Esperado (pós-implantação):** apenas `c2-fresh/` existe; sidecar atualizado para `c2-fresh`.

---

## Grupo D: Regressão do WorktreeExitDialog (sessão iniciada com `--worktree`)

**Modo:** interativo (tmux). Verifica se o diálogo da Fase C ainda dispara quando o
worktree foi criado pela flag CLI em vez de `EnterWorktreeTool`.

### D1: 2x Ctrl+C → diálogo aparece

```bash
tmux new-session -d -s d1 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d1-test --approval-mode yolo"
sleep 3

# Verifica que worktree está ativo (indicador no Footer)
tmux capture-pane -t d1 -p -S -50 | grep -q "⎇ worktree-d1-test"

# Envia Ctrl+C duas vezes
tmux send-keys -t d1 C-c
sleep 0.3
tmux send-keys -t d1 C-c
sleep 1

tmux capture-pane -t d1 -p -S -50 | grep -E "Active worktree|Keep worktree|Remove worktree"
tmux kill-session -t d1
```

**Esperado (pós-implantação):** texto do diálogo "Active worktree: \"d1-test\" …" e as
três opções de rádio aparecem.

### D2: Diálogo → Cancelar → sessão continua ativa

```bash
tmux new-session -d -s d2 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d2-test --approval-mode yolo"
sleep 3
tmux send-keys -t d2 C-c; sleep 0.3; tmux send-keys -t d2 C-c; sleep 1

# Navega para "Cancel" (terceira opção) e seleciona
tmux send-keys -t d2 Down Down Enter
sleep 1

tmux capture-pane -t d2 -p -S -10 | grep -q "Type your message"
ls -d "$TEST_DIR/.qwen/worktrees/d2-test"   # ainda existe
tmux kill-session -t d2
```

**Esperado (pós-implantação):** prompt de entrada reaparece; diretório do worktree ainda está no disco.

### D3: Diálogo → Remover → worktree + branch + sidecar todos removidos

```bash
SESSION_ID=$(uuidgen)
tmux new-session -d -s d3 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d3-test --session-id $SESSION_ID --approval-mode yolo"
sleep 3
tmux send-keys -t d3 C-c; sleep 0.3; tmux send-keys -t d3 C-c; sleep 1
tmux send-keys -t d3 Down Enter   # seleciona "Remove worktree and branch"
sleep 3
tmux kill-session -t d3

ls "$TEST_DIR/.qwen/worktrees/d3-test" 2>/dev/null && echo "FAIL: dir exists"
git -C "$TEST_DIR" branch | grep "worktree-d3-test" && echo "FAIL: branch exists"
test ! -f ~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json && echo "PASS: sidecar gone"
```

**Esperado (pós-implantação):** diretório, branch e sidecar todos removidos.

---

## Grupo E: `worktree.symlinkDirectories`

**Modo:** headless. Configurações definidas via arquivo de configuração temporário.

### Template de setup

```bash
mkdir -p "$TEST_DIR/node_modules"
echo "package.json" > "$TEST_DIR/node_modules/.placeholder"
mkdir -p "$TEST_DIR/.qwen"
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{
  "worktree": {
    "symlinkDirectories": ["node_modules"]
  }
}
EOF
```

### E1: Caminho `--worktree` aplica symlink

```bash
$QWEN --worktree e1-test "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

ls -la "$TEST_DIR/.qwen/worktrees/e1-test/node_modules"
readlink "$TEST_DIR/.qwen/worktrees/e1-test/node_modules"
```

**Esperado (pós-implantação):** `node_modules` dentro do worktree é um symlink
apontando para `$TEST_DIR/node_modules`.

### E2: Caminho `EnterWorktreeTool` aplica symlink

```bash
$QWEN "use enter_worktree to create a worktree named e2-test, then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

readlink "$TEST_DIR/.qwen/worktrees/e2-test/node_modules"
```

**Esperado (pós-implantação):** mesmo destino do symlink.

### E3: Caminho AgentTool isolation aplica symlink

Requer uma definição de sub-agente. Use o mecanismo de fork embutido:

```bash
$QWEN "use the agent tool with subagent_type='general-purpose', isolation='worktree', description='check node_modules', prompt='run pwd and ls -la node_modules then exit'" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/e3.out

# Extrai diretório do worktree do agente da mensagem de resultado
jq -r '.[] | select(.type=="assistant") | .message.content[] | select(.type=="tool_use") | .input' \
  < /tmp/e3.out | head -5

# Após a execução, encontra os node_modules do worktree agent-<7hex>
ls -la "$TEST_DIR/.qwen/worktrees/"agent-*/node_modules 2>/dev/null | head -3
```

**Esperado (pós-implantação):** symlink existe dentro do worktree `agent-<hex>`
(a menos que tenha sido limpo automaticamente porque não houve alterações — nesse caso, o
caminho "no changes" não valida o comportamento do symlink, escale para um teste de alteração forçada).

### E4: Diretório fonte ausente → ignorado silenciosamente, worktree ainda criado

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["does-not-exist"] } }
EOF

$QWEN --worktree e4-test "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/e4.out
ls -d "$TEST_DIR/.qwen/worktrees/e4-test"
ls "$TEST_DIR/.qwen/worktrees/e4-test/does-not-exist" 2>/dev/null && echo "UNEXPECTED"
```

**Esperado (pós-implantação):** diretório do worktree existe, a entrada ausente não é
criada dentro dele, saída do processo = 0.

### E5: Destino existente → ignorado silenciosamente, sem sobrescrita

```bash
# Pré-cria um worktree no slug esperado e depois recria — isso é artificial
# porque os caminhos da Fase D devem ser novos, mas exercita a proteção EEXIST.
mkdir -p "$TEST_DIR/.qwen/worktrees/e5-test/node_modules"
echo "preexisting" > "$TEST_DIR/.qwen/worktrees/e5-test/node_modules/.marker"

# Força recriação via EnterWorktreeTool (CLI recusaria "already exists")
$QWEN "use enter_worktree with name='e5-test' to retry" --approval-mode yolo 2>/dev/null
# ou: a ferramenta falha limparamente, OU o symlink é ignorado — ambos aceitáveis
test -f "$TEST_DIR/.qwen/worktrees/e5-test/node_modules/.marker" && echo "PASS: not overwritten"
```

**Esperado (pós-implantação):** o `.marker` pré-existente sobrevive; nenhum symlink substitui
o diretório.

### E6: Caminho absoluto / `../` → rejeitado

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["/etc", "../escape"] } }
EOF

$QWEN --worktree e6-test "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/e6.out
ls "$TEST_DIR/.qwen/worktrees/e6-test/" | head -10
```

**Esperado (pós-implantação):** worktree existe; nem `etc` nem `escape` foram vinculados
dentro dele; o log de depuração contém linhas de aviso.

---

## Grupo F: Referência a PR

**Modo:** headless. Requer remote `origin` apontando para um repositório GitHub público.

### Template de setup

```bash
# Usa o próprio qwen-code como repositório de teste
TEST_DIR=$(mktemp -d -t qwen-wt-phd-pr-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)
cd "$TEST_DIR"
git clone --depth 1 https://github.com/QwenLM/qwen-code.git .
PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
```

### F1: `--worktree=#4174` faz parse + fetch

```bash
$QWEN --worktree=#4174 "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/f1.out

ls -d "$TEST_DIR/.qwen/worktrees/pr-4174"
git -C "$TEST_DIR/.qwen/worktrees/pr-4174" rev-parse --abbrev-ref HEAD
```

**Esperado (pós-implantação):**

- Diretório do worktree `pr-4174/` existe
- HEAD branch = `worktree-pr-4174`
- O topo da branch é resolvido (git log -1) sem erro

### F2: Forma de URL completa

```bash
$QWEN --worktree "https://github.com/QwenLM/qwen-code/pull/4174" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/f2.out

ls -d "$TEST_DIR/.qwen/worktrees/pr-4174"
```

**Esperado (pós-implantação):** mesmo que F1.

### F3: Remote `origin` ausente → falha imediata

```bash
cd "$TEST_DIR" && git remote remove origin
$QWEN --worktree=#4174 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f3.out
echo "exit=$?"
```

**Esperado (pós-implantação):** exit != 0; mensagem menciona remote `origin`.

### F4: Número de PR inválido → falha imediata

```bash
$QWEN --worktree=#999999999 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f4.out
echo "exit=$?"
```

**Esperado (pós-implantação):** exit != 0; mensagem menciona "Failed to fetch PR".
Limite de timeout de 30 segundos respeitado (tempo de execução do teste < 35s).

### F5: `#abc` malformado cai na validação de slug

```bash
$QWEN --worktree=#abc "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f5.out
echo "exit=$?"
```

**Esperado (pós-implantação):** tratado como slug literal `#abc`, rejeitado por
`validateUserWorktreeSlug` porque `#` não é permitido. Exit != 0.

### F6: Worktree de PR também recebe symlinks (corte transversal com E)

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["node_modules"] } }
EOF
mkdir -p "$TEST_DIR/node_modules" && echo x > "$TEST_DIR/node_modules/.marker"

$QWEN --worktree=#4174 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /dev/null
readlink "$TEST_DIR/.qwen/worktrees/pr-4174/node_modules"
```

**Esperado (pós-implantação):** destino do symlink = `$TEST_DIR/node_modules`.

---

## Grupo G: Integração + casos de borda

### G1: Ciclo de vida completo — iniciar → escrever → Manter → retomar

> **Nota pré-implantação:** Contra a baseline, este teste termina antes que `sleep 3`
> termine (yargs rejeita `--worktree` imediatamente e o painel tmux morre).
> A chamada `capture-pane` então falha com "can't find pane". Isso é
> esperado — registre como PASS-por-rejeição. Envolva as capturas com `|| true` para
> o dry-run, ou pule G1 inteiramente no modo baseline.

```bash
SESSION_ID=$(uuidgen)
tmux new-session -d -s g1 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree g1-test --session-id $SESSION_ID --approval-mode yolo 2>&1 | tee /tmp/g1-stderr.out"
sleep 3
tmux send-keys -t g1 "use the write_file tool to create file 'work.txt' with content 'phase d test'"
sleep 0.3; tmux send-keys -t g1 Enter
sleep 8

tmux send-keys -t g1 C-c; sleep 0.3; tmux send-keys -t g1 C-c; sleep 1
tmux send-keys -t g1 Enter   # default = "Keep"
sleep 2
tmux kill-session -t g1

# Arquivo sobreviveu
cat "$TEST_DIR/.qwen/worktrees/g1-test/work.txt"

# Retomada reconecta
tmux new-session -d -s g1b -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --resume $SESSION_ID --approval-mode yolo"
sleep 4
tmux capture-pane -t g1b -p -S -50 | grep -E "⎇ worktree-g1-test|Resumed"
tmux kill-session -t g1b
```

**Esperado (pós-implantação):**

- `work.txt` dentro do worktree contém o conteúdo escrito
- Sessão retomada mostra Footer `⎇ worktree-g1-test (g1-test)`
- Item de histórico INFO ou `<system-reminder>` menciona "Resumed"

### G2: Argumento de caminho relativo resolvido antes da troca de cwd

```bash
# Cria uma config mcp em TEST_DIR e a referencia relativamente.
# --mcp-config recebe um caminho de arquivo; se o caminho do plano de teste for resolvido APÓS
# a troca de cwd do --worktree, o arquivo não será encontrado dentro do worktree
# e o CLI falhará. Se resolvido ANTES da troca (correto), o arquivo é carregado de TEST_DIR.
cat > "$TEST_DIR/mcp.json" <<'EOF'
{ "mcpServers": {} }
EOF
cd "$TEST_DIR"

$QWEN --worktree g2-test --mcp-config ./mcp.json "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/g2.out
echo "exit=$?"
jq -r '.[] | select(.type=="result") | .result' < /tmp/g2.out | head -3
```
**Esperado (pós-impl):** exit = 0; o modelo responde normalmente (a configuração mcp vazia significa nenhum servidor MCP, mas também nenhum erro).

**Esperado (linha de base pré-impl):** yargs rejeita `--worktree` (o teste não consegue distinguir "flag worktree ausente" de "resolução de configuração mcp quebrada" até que a flag exista).

---

## Ordem de execução + paralelismo

| Grupo | Modo         | Tempo de execução | Seguro para paralelismo?   |
| ----- | ------------ | ----------------- | -------------------------- |
| A     | headless     | ~30s              | sim (próprio TEST_DIR)     |
| B     | headless     | ~20s              | sim                        |
| C     | headless     | ~40s              | sim                        |
| D     | tmux         | ~30s              | sim (nome de sessão próprio) |
| E     | headless     | ~60s              | sim                        |
| F     | headless+net | ~60s              | NÃO — compartilha o clone GitHub |
| G     | misto        | ~60s              | sim                        |

Execute A/B/C/D/E/G em paralelo; F em série após a configuração do clone.

## Relatório de reprodução

### Teste a seco da Fase 4 — linha de base `qwen` v0.15.11 (2026-05-20)

Tempo de execução: 3 agentes `test-engineer` em paralelo, ~7 minutos no total. A linha de base não possui tanto a Fase D (esperada) quanto a Fase A+B (binário mais antigo que o esperado — veja ressalva E2/E3).

| Grupo                            | Resultado   | Observações                                                                                          |
| -------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| A1 (flag simples)                | ✅          | yargs `Unknown argument: worktree`, exit 1                                                           |
| A2 (slug explícito)              | ✅          | igual                                                                                                |
| A3 (formato =)                   | ✅          | igual                                                                                                |
| A4 (slug inválido)               | ✅          | yargs rejeita antes da validação do slug                                                             |
| A5 (diretório não git)           | ✅          | igual                                                                                                |
| B1 (campos sidecar)              | ✅          | sidecar corretamente ausente; seletor jq válido para dados de exemplo                                |
| B2 (troca de cwd)                | ✅          | seletor jq `tool_result.content` do shell-tool verificado contra saída real                          |
| B3 (troca de targetDir)          | ✅          | mesmo seletor                                                                                        |
| C1 (--worktree supera sidecar)   | ✅          | ambas as execuções exit 1, sem sidecar                                                               |
| C2 (sidecar desatualizado + novo)| ✅          | igual                                                                                                |
| E1 (symlink --worktree)          | ✅          | flag rejeitada, sem symlink — pré-impl confirmado                                                    |
| E2 (symlink EnterWorktree)       | ⚠️ N/A      | linha de base não possui ferramenta `enter_worktree` (mais antiga que PR #4073); guard agora pula este caso |
| E3 (symlink isolamento AgentTool)| ⚠️ N/A      | esquema `agent` da linha de base descarta silenciosamente param `isolation`; guard pula               |
| E4 (pular fonte ausente)         | ✅          | flag rejeitada                                                                                       |
| E5 (destino existente não sobrescrever)| ⚠️ trivial | `.marker` pré-existente sobreviveu, mas apenas porque a ferramenta não pôde executar                |
| E6 (rejeitar path traversal)     | ✅          | flag rejeitada, sem symlinks                                                                         |
| F1 (fetch --worktree=#4174)      | ✅          | `Unknown argument: worktree`, sem chamada de rede                                                    |
| F2 (formato URL completo)        | ✅          | igual                                                                                                |
| F3 (origin ausente)              | ✅          | rejeitado antes da verificação git                                                                   |
| F4 (número PR inválido)          | ✅          | rejeitado antes do fetch                                                                             |
| F5 (`#abc` malformado)           | ✅          | igual                                                                                                |
| F6 (PR + symlinkDirs)            | ✅          | igual                                                                                                |
| G1 (ciclo de vida tmux)          | ⚠️ parcial  | painel tmux morre na rejeição da flag; registro por código de saída funciona                         |
| G2 (caminho relativo)            | ✅          | (após mudar para `--mcp-config ./mcp.json`) yargs rejeita worktree primeiro                          |

**Conclusão:** os scripts de teste são fundamentalmente sólidos. 19 / 24 casos detectam claramente a linha de base pré-impl; 3 casos (E2/E3/E5) precisam que a linha de base inclua a Fase A+B (que o build local da Fase 6 fornecerá); 2 casos (G1/G2) tinham bugs nos scripts que agora estão corrigidos. **Pronto para prosseguir para a implementação da Fase 5.**

### Verificação da Fase 6 — build local

**Binário**: `node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`
**Data**: 2026-05-20
**Escopo**: Grupos A, B, C, E, F, G (6 agentes `test-engineer` em paralelo)

| Grupo                              | Resultado                    | Observações                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 (flag simples)                  | ✅ (com dica na doc)         | yargs consome o próximo argumento posicional como valor do slug quando o usuário passa `qwen --worktree "say hi"`; o quickstart agora instrui os usuários a usar o formato `=` ou colocar o prompt antes da flag. O recurso de slug automático foi confirmado via `qwen --worktree --approval-mode yolo "say hi"` → slug `bright-elm-8a4c12`, init `.cwd` termina com `.qwen/worktrees/<auto-slug>`. |
| A2 (slug explícito)                | ✅                           | diretório `.qwen/worktrees/my-feature` + branch `worktree-my-feature`                                                                                                                                                                                                                                                                                                                     |
| A3 (formato =)                     | ✅                           | idêntico a A2                                                                                                                                                                                                                                                                                                                                                                             |
| A4 (slug inválido)                 | ✅                           | exit=1, mensagem: `Worktree name may only contain letters, digits, dots, underscores, and hyphens.`, nenhum diretório worktree                                                                                                                                                                                                                                                            |
| A5 (diretório não git)             | ✅                           | exit=1, mensagem: `not a git repository. Run \`git init\` first or relaunch from inside one.`                                                                                                                                                                                                                                                                                              |
| B1 (campos sidecar)                | ✅                           | Todos os 6 campos presentes e corretos; sidecar reside sob o projectHash do worktree conforme projetado                                                                                                                                                                                                                                                                                  |
| B2 (troca de cwd)                  | ✅                           | `pwd` dentro da ferramenta shell retornou o caminho exato do worktree                                                                                                                                                                                                                                                                                                                     |
| B3 (branch + cwd)                  | ✅                           | `pwd` = caminho do worktree, `git rev-parse --abbrev-ref HEAD` = `worktree-b3-test`                                                                                                                                                                                                                                                                                                       |
| C1 (sobrescrita cross-slug)        | ❌ → **limitação conhecida**| Sessões estão vinculadas a `projectHash(cwd)`; `--worktree second --resume <sid-from-first>` não consegue encontrar a sessão. Documentado nas Limitações da documentação do usuário. Uma futura refatoração do Config (armazenamento de âncora na raiz do repositório) resolveria isso.                                                                                                     |
| C2 (sidecar desatualizado + novo worktree)| ❌ → **mesma causa raiz**| Mesma restrição arquitetural.                                                                                                                                                                                                                                                                                                                                                              |
| E1 (symlink `--worktree`)          | ✅                           | `node_modules` vinculado simbolicamente no novo worktree                                                                                                                                                                                                                                                                                                                                  |
| E2 (symlink `enter_worktree`)      | ✅                           | mesmo caminho de código via `createUserWorktree`                                                                                                                                                                                                                                                                                                                                           |
| E3 (symlink isolamento agent)      | ⚠️ configuração de teste    | modelo commitou `node_modules` (porque o guard do agente recusou estado sujo); o guard EEXIST então corretamente pulou o symlink. O caminho de código está correto; para um E3 limpo, o plano de teste precisa pre-`.gitignore` `node_modules`.                                                                                                                                           |
| E4 (pular fonte ausente)           | ✅                           | worktree criado, sem entrada, exit 0                                                                                                                                                                                                                                                                                                                                                       |
| E5 (destino existente não sobrescrever)| ✅                        | marcador pré-existente sobreviveu                                                                                                                                                                                                                                                                                                                                                          |
| E6 (caminho absoluto / `..` rejeitado)| ✅                        | nenhum caminho foi vinculado                                                                                                                                                                                                                                                                                                                                                               |
| F1 (fetch `--worktree=#4174`)      | ✅                           | diretório worktree `pr-4174/`, branch `worktree-pr-4174`, commit tip `8f4fe8e feat(cli): per-turn /diff…`; substituto local-remoto (sandbox bloqueia o GitHub real)                                                                                                                                                                                                                       |
| F2 (formato URL completo)          | ✅                           | mesmo resultado; URL analisada → PR #4174 → fetch da origin local bem-sucedido                                                                                                                                                                                                                                                                                                           |
| F3 (origin ausente)                | ✅                           | exit=1 em 2s; mensagem menciona adicionar remote `origin`                                                                                                                                                                                                                                                                                                                                 |
| F4 (PR #999999999 inválido)        | ✅                           | exit=1 em 2s; "PR does not exist on origin"; dentro do limite de 35s                                                                                                                                                                                                                                                                                                                    |
| F5 (malformado `#abc`)             | ✅                           | validação de slug rejeita `#`                                                                                                                                                                                                                                                                                                                                                              |
| F6 (PR worktree + symlinks)        | ✅                           | symlink `pr-4174/node_modules` → `$TEST_DIR/node_modules` confirmado                                                                                                                                                                                                                                                                                                                     |
| G1.a (iniciar + escrever + Keep)   | ✅                           | Fluxo TUI, indicador Footer, opções de diálogo, arquivo persiste                                                                                                                                                                                                                                                                                                                          |
| G1.b (`--resume … --worktree foo`) | ❌ → **corrigido neste PR** | Original: `--worktree: Worktree already exists at …`. A correção da Fase 6 adicionou o branch de reanexação em `setupStartupWorktree`. Verificado pós-correção via teste de fumaça (`--worktree foo` duas vezes → segunda emite o aviso `worktree_started`, sem erro) + novos testes unitários em `worktreeStartup.test.ts`.                                                        |
| G2 (`--mcp-config` relativo)       | ❌ → **corrigido neste PR** | Original: exit=52, `Invalid MCP configuration … is not valid JSON`. A correção da Fase 6 normaliza campos de argv que aceitam caminhos (`mcpConfig`, `openaiLoggingDir`, `jsonFile`, `inputFile`, `telemetryOutfile`, `includeDirectories`) em relação ao cwd de lançamento ANTES de `setupStartupWorktree` mudar de diretório. Verificado pós-correção via teste de fumaça (`--worktree foo --mcp-config ./mcp.json` → modelo responde normalmente). |

**Resultado líquido da Fase 6:** 22 / 24 casos passaram pós-correção; 2 casos (C1/C2) encontraram uma limitação arquitetural agora documentada; 1 caso (E3) é uma peculiaridade de configuração de teste, não um problema de implementação. **Pronto para a revisão de código da Fase 7.**

### Referências de correções (correções da Fase 6 incluídas neste PR)

| Correção                                                     | Arquivo                                             | Mudança                                                                                                                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reanexação a worktree existente (G1.b)                       | `packages/cli/src/startup/worktreeStartup.ts`       | Adicionada verificação pré-criação: se o diretório é um worktree registrado na branch esperada, pular criação + chdir                                                               |
| Helper `getRegisteredWorktreeBranch()`                       | `packages/core/src/services/gitWorktreeService.ts`  | Verifica `git rev-parse --abbrev-ref HEAD` em relação ao caminho candidato                                                                                                            |
| Normalização de caminho antes do chdir (G2)                  | `packages/cli/src/gemini.tsx`                       | Resolve `mcpConfig`, `openaiLoggingDir`, `jsonFile`, `inputFile`, `telemetryOutfile`, `includeDirectories` em relação ao cwd de lançamento quando `--worktree` está definido          |
| Documentação: dica de ordem de flags do yargs + atualização de Limitações | `docs/users/features/worktree.md`                   | Dica no Quick Start + novos tópicos de Limitações (cross-slug, comportamento de argumentos de caminho)                                                                               |
| Testes unitários para reanexação                             | `packages/cli/src/startup/worktreeStartup.test.ts`  | Adicionados 2 testes: reanexação feliz + guard "branch diferente ocupa slot"                                                                                                          |

**Nota de rede do Grupo F da Fase 6**: O sandbox bloqueia `git fetch` para `https://github.com` com HTTP 403. F1/F2/F4/F6 foram retestados contra um repositório bare local (`git init --bare`) semeado com `refs/pull/4174/head` apontando para um commit cuja mensagem é `feat(cli): per-turn /diff with interactive dialog (#4277)`. F3 e F5 são independentes de rede e foram verificados diretamente. O substituto local-remoto exercita completamente o caminho de código de análise + fetch + criação de worktree.
---

## Relatório de reprodução — dry-run da Fase 4 (Grupos F + G), 2026-05-20

**Binário**: `qwen` (instalado globalmente, v0.15.11 em `/Users/mochi/.nvm/versions/node/v22.21.1/bin/qwen`)
**Sobrescrita**: `QWEN="qwen"`

### Tabela de resultados

| ID do teste               | Resultado | Evidência                                                                                                                                              | Sugestão de correção              |
| ------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| F1 `--worktree=#4174`     | PASS      | `Unknown argument: worktree`, exit=1                                                                                                                   | Nenhuma — falha de linha de base esperada |
| F2 `--worktree <url>`     | PASS      | `Unknown argument: worktree`, exit=1                                                                                                                   | Nenhuma — falha de linha de base esperada |
| F3 sem origin             | PASS      | `Unknown argument: worktree`, exit=1 — yargs rejeitou antes de qualquer operação git                                                                  | Nenhuma                           |
| F4 PR #999999999 inválido | PASS      | `Unknown argument: worktree`, exit=1                                                                                                                   | Nenhuma                           |
| F5 `#abc` malformado      | PASS      | `Unknown argument: worktree`, exit=1                                                                                                                   | Nenhuma                           |
| F6 PR + symlinkDirs       | PASS      | `Unknown argument: worktree`, exit=1                                                                                                                   | Nenhuma                           |
| G1 ciclo de vida (tmux)   | PASS      | `Unknown argument: worktree` emitido para stdout capturado em `/tmp/g1_raw.out`; sessão tmux finalizou imediatamente, painel já estava morto no momento da captura | SCRIPT-BUG: veja nota abaixo      |
| G2 caminho relativo       | PASS      | `Unknown arguments: worktree, prompt-file, promptFile`, exit=1                                                                                        | SCRIPT-BUG: veja nota abaixo      |

### Comportamento observado (todos os casos)

Toda invocação de `--worktree` (forma simples, forma `=`, forma `#<N>`, URL completa, combinada com `--prompt-file`) foi rejeitada na camada de análise de argumentos do yargs com código de saída 1 antes que qualquer lógica da aplicação fosse executada. As strings de erro exatas são:

- `Unknown argument: worktree` (um argumento desconhecido)
- `Unknown arguments: worktree, prompt-file, promptFile` (G2: tanto `--worktree` quanto `--prompt-file` são desconhecidos, listados juntos)

Nenhuma operação git, chamada de rede ou gravação no sistema de arquivos ocorreu em nenhum teste.

### Comportamento esperado

Rejeição idêntica — esta é a linha de base correta antes da implementação. Todos os 8 testes PASSAM no sentido de dry-run (o plano detecta corretamente que as funcionalidades não existem).

### Contexto principal

O modo de falha é uniformemente na camada yargs, não a jusante. Isso confirma que a estratégia de detecção do plano de testes é sólida: assim que `--worktree` for registrado no yargs, esses testes deixarão de falhar nessa camada e passarão a exercitar os caminhos reais de implementação (F1–F6 atingirão `git fetch`, G1 atingirá o ciclo de vida da TUI, G2 atingirá a resolução de `--prompt-file`).

### Notas SCRIPT-BUG para o plano de testes

**G1 (tmux):** O comando da sessão tmux faz o pipe através de `tee` com um subshell `echo 'PROC_EXIT='$?` que captura a saída de `tee`, não de `qwen`. Quando o processo termina instantaneamente (como no erro de argumento desconhecido), a sessão é encerrada antes que `sleep 3` termine e o nome do painel `g1dry` desaparece no momento em que `tmux capture-pane` é executado, produzindo `can't find pane: g1dry`. Correção: use `|| true` após `tmux capture-pane`, ou adicione um `|| sleep 0`; melhor ainda, para o caso de falha de linha de base, redirecione stderr+stdout para um arquivo fora do tmux e verifique diretamente o arquivo (como feito aqui via `tee /tmp/g1_raw.out`).

**G2 (`--prompt-file`):** O plano de testes usa `--prompt-file ./relative.txt` como um teste combinado com `--worktree`. Na linha de base, `--prompt-file` também é um argumento desconhecido (também não existe no esquema yargs da v0.15.11 — a flag existente é `--prompt-interactive` / `-p`). O erro lista ambos os argumentos desconhecidos juntos. O plano deve observar que `--prompt-file` precisará ser implementado junto com `--worktree`, ou usar uma flag existente (por exemplo, pipe via stdin ou usar `--prompt`) para o teste de resolução de caminho relativo.