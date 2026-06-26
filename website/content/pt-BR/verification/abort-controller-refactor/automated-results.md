# Resultados da verificação automatizada

Capturado em 2026-05-20 durante a refatoração do AbortController.

## 1. Reprodução do acúmulo de listeners

Simulação direta do padrão de acúmulo de listeners observado em longas
sessões (1500+ abort listeners em um único AbortSignal). O script está
em `listener-accumulation-repro.mjs`.

```text
$ node docs/verification/abort-controller-refactor/listener-accumulation-repro.mjs
Simulating 2000 rounds for each pattern.

OLD pattern listener count on long-lived parent: 2000
NEW pattern listener count on long-lived parent: 0
PASS: OLD pattern accumulated >1500 listeners (reproduces the bug).
PASS: NEW pattern kept listener count at 0 — the helper prevents accumulation.
```

Esta é uma prova autocontida: o padrão ANTIGO (`addEventListener` puro
sem `{once:true}` ou limpeza reversa) acumula 2000 listeners ao longo de
2000 rodadas — bem acima do limite de 1500 observado pelo usuário. O
padrão NOVO (`createChildAbortController` de `packages/core/src/utils/abortController.ts`)
mantém a contagem de listeners do pai em 0 durante 2000 rodadas porque o
listener de limpeza reversa de cada filho remove o listener do pai quando
o filho aborta.

## 2. Escopo da migração (intencional)

Apenas a cadeia pai→filho do agent-runtime que realmente acumula listeners
em um sinal pai de longa duração foi migrada para o helper:

- `packages/core/src/agents/runtime/agent-interactive.ts` (rodada mestre + por mensagem)
- `packages/core/src/agents/runtime/agent-core.ts` (rodada por iteração + waitForExternalInputs + processFunctionCalls try/finally)
- `packages/core/src/agents/runtime/agent-headless.ts` (external → execution)
- `packages/core/src/hooks/promptHookRunner.ts` (tinha um vazamento real de limpeza: `addEventListener` manual sem `{once:true}` e nunca removido)

Mais três correções apenas com `{once:true}` (sem troca de helper, apenas
correção defensiva):

- `packages/core/src/hooks/hookRunner.ts`
- `packages/core/src/hooks/functionHookRunner.ts`
- `packages/core/src/confirmation-bus/message-bus.ts`

Controladores independentes de curta duração (por comando shell em
`tools/shell.ts`, por monitor em `tools/monitor.ts`, por sessão de arena em
`agents/arena/ArenaManager.ts`, por recall em `core/client.ts`,
por fetch em `utils/fetch.ts`, por dream / per-title / per-judge / per-resume,
etc.) permanecem com `new AbortController()` puro — eles são coletados pelo
GC ao final do uso e não acumulam em um pai de longa duração.

Veja `migration-completeness.txt` para o grep real + justificativa.

## 3. Suítes de teste afetadas

Todos os 71 arquivos de teste afetados / 2085 testes passam (3 ignorados — 1 é o
teste GC que requer `--expose-gc`, 2 são ignorados preexistentes na suíte
headless).

```text
 Test Files  71 passed (71)
      Tests  2085 passed | 3 skipped (2088)
   Duration  16.71s
```

Cobertura:

- `packages/core/src/utils/abortController.test.ts` — 26 testes: limite da
  factory (padrão + customizada), propagação filho, limpeza reversa, fast path,
  pai undefined, passagem de custom-maxListeners, semântica de
  `combineAbortSignals` (incluindo cleanup-cancela-timeout,
  timeout-limpa-listeners-de-entrada, limite `timeoutMs <= 0`, verificação
  defensiva no meio da iteração), segurança GC (melhor esforço).
- `packages/cli/src/utils/warningHandler.test.ts` — 13 testes: idempotência,
  supressão de AbortSignal (incluindo formato `[AbortSignal{...}]`),
  EventTarget genérico NÃO suprimido, passagem em modo debug, fan-out para
  listeners anteriores, integração stderr de ponta a ponta com processo filho.
- `packages/core/src/hooks/httpHookRunner.test.ts` — cobre o consumidor migrado
  de `combineAbortSignals` (o shim obsoleto `createCombinedAbortSignal` e seu
  arquivo de teste foram removidos assim que o único chamador foi migrado).
- `packages/core/src/agents/runtime/{agent-core,agent-interactive,agent-headless,agent-context,agent-statistics}.test.ts` — 102 testes cobrindo os arquivos migrados de alto impacto.
- `packages/core/src/core/openaiContentGenerator/**` — 280+ testes incluindo o
  pipeline que perdeu o band-aid `raiseAbortListenerCap`.
- `packages/core/src/followup/**` — 100+ testes incluindo o controlador de
  especulação migrado.
- `packages/core/src/tools/agent/**`, `packages/core/src/tools/shell.test.ts`,
  `packages/core/src/services/**`, `packages/core/src/hooks/**`,
  `packages/core/src/confirmation-bus/**` — todos os arquivos de
  ferramentas/hooks/serviços migrados.

## 4. Verificação de tipos em modo estrito TypeScript

```sh
$ node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit
(sem saída, exit 0)

$ node_modules/.bin/tsc -p packages/cli/tsconfig.json --noEmit
(sem saída, exit 0)
```

## 5. Formatação Prettier

```sh
$ node_modules/.bin/prettier --check packages/core/src/agents/runtime/agent-core.ts \
    packages/core/src/agents/runtime/agent-headless.ts \
    packages/cli/src/utils/warningHandler.ts \
    packages/cli/src/utils/warningHandler.test.ts \
    packages/core/src/utils/abortController.ts \
    packages/core/src/utils/abortController.test.ts
Checking formatting...
All matched files use Prettier code style!
```

## 6. Build + teste de fumaça binário

```sh
$ npm run build:packages
(sucesso para todos os 5 pacotes do workspace)

$ NODE_OPTIONS=--trace-warnings node packages/cli/dist/index.js --version
0.15.11
EXIT=0

$ node packages/cli/dist/index.js --help
Usage: qwen [options] [command]
...
```

Nenhum aviso emitido durante a inicialização com `--trace-warnings`.

## 7. Revisão independente do Codex

Duas rodadas completas pelo agente `codex:codex-rescue` (contexto independente
cada vez). A primeira rodada revelou 3 problemas — todos corrigidos em commits
subsequentes:

1. **Erro entre criação do controlador e abort explícito vaza listener** no
   corpo por iteração de `agent-core.ts` e na configuração pré-try-block de
   `agent-headless.ts`. Corrigido envolvendo cada um em `try { ... } finally {
abortController.abort(); }`.
2. **Regex do supressor de avisos `EventTarget` muito amplo**. Restrito para
   corresponder apenas a `AbortSignal` (qualquer formato que Node ≥20 produza).
3. **`process.removeAllListeners('warning')` remove listeners de terceiros**.
   Removido — confiando na semântica do Node 'sem listeners → impressora padrão
   dispara' para que adicionar nosso handler desabilite implicitamente o caminho
   de impressão padrão enquanto mantém intactos os listeners de telemetria de
   terceiros.

Segunda rodada confirmou todas as correções corretas, sem bloqueios adicionais.

## O que resta para verificação interativa

Os cenários em `README.md` numerados de 00 a 09 exigem uma sessão interativa real
contra a API do modelo (conversas longas com ferramentas mistas, Ctrl-C no meio
do stream, cancelamento de subagentes, snapshots de heap). Eles estão
documentados para execução humana e as transcrições devem ser anexadas ao corpo
do PR quando executados.