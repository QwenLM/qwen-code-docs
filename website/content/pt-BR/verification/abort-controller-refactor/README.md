# Refatoração do AbortController — plano de verificação

Cenários usados para validar a alteração manualmente antes de abrir o PR.  
Cada cenário captura o painel tmux via `tmux pipe-pane -o 'cat >> <log>'`.

## Configuração inicial

```sh
# Aponte WT para seu checkout local do branch em revisão.
WT=/caminho/para/qwen-code/worktree
LOGDIR=$WT/docs/verification/abort-controller-refactor/logs
mkdir -p "$LOGDIR"

# Compile a CLI uma vez (pule imagem sandbox, pule vscode).
( cd "$WT" && npm run build:packages )
```

## Cenários

Para cada cenário:

```sh
tmux new-session -d -s qwen-verify-XX
tmux pipe-pane -t qwen-verify-XX -o "cat >> $LOGDIR/XX-name.log"
tmux send-keys -t qwen-verify-XX "cd /path/to/your/test/workspace && exec node $WT/packages/cli/dist/index.js" C-m
tmux attach -t qwen-verify-XX
```

Então execute a sessão manualmente conforme a matriz abaixo. Pressione `C-b d` para desanexar quando terminar; `tmux kill-session -t qwen-verify-XX` para parar o painel.

### 00 — Linha de base (pré-correção)

- **Setup:** checkout do `main`, compile, execute com `NODE_OPTIONS=--trace-warnings`.
- **Input:** sessão longa de 50 rodadas com ferramentas mistas (shell + edit + grep + agent).
- **Expected:** após ~30–40 rodadas, `MaxListenersExceededWarning: ... 1500+ abort listeners added to [AbortSignal]` impresso em stderr.
- **Log:** `00-baseline-reproduction.log`.

### 01 — Sessão longa, modo DEBUG (este branch)

- **Setup:** `NODE_OPTIONS=--trace-warnings DEBUG=1 qwen`.
- **Input:** mesmo script de 50 rodadas do #00.
- **Expected:** nenhum `MaxListenersExceededWarning` impresso; quaisquer outros avisos ainda são impressos.
- **Log:** `01-long-session-debug.log`.

### 02 — Sessão longa, modo produção (este branch)

- **Setup:** `qwen` (sem env de debug).
- **Input:** mesmo script de 50 rodadas.
- **Expected:** saída limpa; uma sonda temporária `console.error` dentro do handler (adicionada e depois removida) confirma que o filtro é acionado.
- **Log:** `02-long-session-prod.log`.

### 03 — Aborto com Ctrl-C no meio da stream

- **Setup:** este branch, interativo.
- **Input:** peça uma geração longa (>30s); pressione Ctrl-C no meio.
- **Expected:** o stream para em ~200ms, banner "Cancelled" mostrado, próximo prompt aceita entrada. A contagem de `process._getActiveHandles()` retorna à linha de base (use `:debug handles`).
- **Log:** `03-ctrlc-streaming.log`.

### 04 — Cancelar shell de longa execução

- **Setup:** este branch.
- **Input:** execute `sleep 60` através da ferramenta shell; cancele no meio da execução.
- **Expected:** processo filho morto (verificar com `pgrep -f sleep` retornando vazio), resultado da ferramenta mostra cancelamento, agente aceita próximo prompt.
- **Log:** `04-shell-cancel.log`.

### 05 — Cancelamento de subagente

- **Setup:** este branch.
- **Input:** dispare uma tarefa de agente longa através da ferramenta agent; cancele a partir do pai.
- **Expected:** as chamadas de ferramenta em andamento do subagente abortam, o stream do modelo do subagente para, o pai recebe evento de cancelamento.
- **Log:** `05-subagent-cancel.log`.

### 06 — Aborto headless / não interativo

- **Setup:** `qwen --prompt "do a long task"`; envie `SIGINT` de fora via `kill -INT <pid>`.
- **Expected:** desligamento limpo, código de saída 130, sem avisos.
- **Log:** `06-headless-abort.log`.

### 07 — Fluxo de agente em background

- **Setup:** interativo.
- **Input:** dispare um agente em background (`run_in_background: true`); deixe-o completar; dispare um segundo; cancele o segundo no meio do voo.
- **Expected:** primeiro agente completa normalmente; segundo aborta limpo; nenhum vazamento de listener entre os dois.
- **Log:** `07-background-agent.log`.

### 08 — Linha de base de memória

- **Setup:** `qwen --inspect`, conecte o Chrome devtools.
- **Input:** sessão de 100 rodadas.
- **Expected:** snapshots de heap nas rodadas 0/50/100. Contagem de instâncias `AbortSignal` e contagem de listeners por sinal estável (nenhum crescimento monotônico).
- **Log:** `08-memory-snapshots/`.

### 09 — Consumer existente de combinedAbortSignal

- **Setup:** dispare um HTTP hook com ambos sinal externo e timeout.
- **Input:** (a) cancele o sinal externo no meio do hook; (b) deixe o timeout disparar em uma execução separada.
- **Expected:** hook aborta limpo em ambos os casos; caminho do shim de depreciação é exercitado.
- **Log:** `09-http-hook-shim.log`.

## Verificações automatizadas (não interativas)

As verificações automatizadas abaixo foram executadas durante o desenvolvimento e registradas em `automated-results.md`:

- Todos os testes unitários do abortController passam (`abortController.test.ts`, 26 testes; 1 teste de GC pulado sem `--expose-gc`).
- Todos os testes do warningHandler passam (`warningHandler.test.ts`, 13 testes incluindo um teste de integração de stderr de processo filho).
- Todos os testes de consumer de `combineAbortSignals` passam (`httpHookRunner.test.ts`); o shim depreciado `createCombinedAbortSignal` e seu próprio arquivo de teste foram removidos depois que o único chamador migrou.
- Todos os testes de agent runtime / followup / openaiContentGenerator / hooks passam.
- Escopo da migração (intencional): apenas a cadeia pai→filho do agent-runtime (`agent-interactive.ts`, `agent-core.ts`, `agent-headless.ts`) mais `promptHookRunner.ts` (vazamento real de limpeza) foram trocados para o helper. Controladores independentes de curta duração (por-comando-shell, por-fetch, por-recall, etc.) permanecem com raw `new AbortController()` — eles são coletados rapidamente pelo GC e não acumulam listeners em um pai de longa duração. Veja `migration-completeness.txt` para o grep capturado + fundamentação.
- A verificação de tipos do TypeScript em modo estrito passa para ambos `packages/core` e `packages/cli`.
- A verificação do Prettier passa em todos os arquivos modificados.

Veja `automated-results.md` para a saída real dos comandos.

## Como capturar os artefatos para o corpo do PR

Após executar cada cenário, anexe o arquivo de transcrição (ou trecho relevante) ao PR. Para #08 (memória), exporte os snapshots de heap e inclua o delta da contagem de listeners entre os snapshots.