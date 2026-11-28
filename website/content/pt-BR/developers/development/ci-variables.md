# Variáveis de CI e Release

Diversos parâmetros dos pipelines de CI e release são expostos como variáveis
de repositório do GitHub Actions (o contexto `vars.*`) para que os operadores
possam ajustá-los sem abrir um pull request. Esta página lista as variáveis que
afetam a execução de testes em `.github/workflows/ci.yml` e
`.github/workflows/release.yml`, junto com seus valores padrão e onde cada uma
se aplica.

## Definindo uma variável

Os mantenedores do repositório definem essas variáveis em **Settings → Secrets
and variables → Actions → Variables**. Uma variável não definida (ou vazia) usa
o fallback na expressão do workflow. O limite de workers se aplica apenas a
runners reservados, mesmo quando sua variável está definida.

Os arquivos de workflow são a fonte da verdade para esses parâmetros, e as
suites de teste fixam as expressões do workflow byte por byte:
`scripts/tests/package-scripts.test.js` fixa a expressão compartilhada de
limite de workers em `release.yml` (`QWEN_CI_VITEST_MAX_WORKERS` com a guarda
`ecs-qwen-`), `scripts/tests/no-ak-integration-ci.test.js` fixa a expressão de
limite de workers em `ci.yml`, e
`scripts/tests/release-workflow.test.js` fixa as expressões de retry e timeout
de workspace-test do `release.yml`. `scripts/tests/package-scripts.test.js`
também verifica os valores padrão documentados e as localizações dos workflows
em ambos os workflows. Como essa guarda é executada na lane de CI de perfil
completo (`test:scripts`) e não nas verificações exclusivas de docs, verifique
edições restritas a esta página localmente antes de abrir um pull request com
`npm run test:scripts` (ou `npx vitest run --config ./scripts/tests/vitest.config.ts scripts/tests/package-scripts.test.js`).
Se as docs e os workflows divergirem, confie nos workflows e atualize esta
página na mesma alteração.

## Variáveis

| Variável                                   | Padrão | Usada em                | Controla                                                                                    |
| ------------------------------------------ | ------ | ----------------------- | ------------------------------------------------------------------------------------------- |
| `QWEN_CI_VITEST_RETRY`                     | `2`    | `ci.yml`                | Contagem de retries para o step principal de teste de workspace e scripts do CI             |
| `QWEN_CI_HOST_LOAD_MAX_RATIO`              | `2.0`  | `ci.yml`                | Teto de carga por CPU no qual ou acima do qual um host Linux self-hosted é recusado antes das suites unitárias |
| `QWEN_CI_RPC_RETRY`                        | `1`    | `ci.yml`                | Re-execuções de uma suite de workspace toda verde que falhou apenas no timeout de RPC do worker do Vitest |
| `QWEN_RELEASE_VITEST_RETRY`                | `2`    | `release.yml`           | Contagem de retries para os shards de teste de workspace do release                         |
| `QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES`   | `45`   | `release.yml`           | Timeout do job de cada shard de teste de workspace do release                               |
| `QWEN_CI_VITEST_MAX_WORKERS`               | `4`    | `ci.yml`, `release.yml` | Limite de workers para testes unitários do CI principal e testes de workspace/quality do release em runners reservados |

### Contagens de retry

`QWEN_CI_VITEST_RETRY` e `QWEN_RELEASE_VITEST_RETRY` são passados ao Vitest
como `--retry=<n>` no step principal de teste do CI (o `test:ci` de cada
workspace, que esse step executa em duas lanes concorrentes, e
`npm run test:scripts:unit`) e na lane de release
(`npm run test:release:workspaces`) respectivamente. As duas lanes têm
variáveis separadas para que possam ser ajustadas independentemente.

O Vitest reexecuta testes que falharam dentro da mesma execução. Isso pode
ajudar com contenção intermitente, mas uma falha que se recupera dentro do
orçamento de retry torna o check verde e não é registrada como falha pelo
rastreador de flaky-rerun. Mantenha o orçamento modesto em vez de usar retries
para mascarar uma suite instável. Ambas as variáveis também aceitam o valor
literal `off`, que omite inteiramente a flag `--retry` em vez de passar
`--retry=0` (um `--retry=0` na linha de comando sobrepõe a configuração
própria do Vitest do workspace e desabilitaria uma política de retry
deliberada).

### Timeouts de RPC do worker em um host com contenção

`QWEN_CI_RPC_RETRY` é uma alavanca diferente do `--retry`: ele re-executa uma suite
de workspace inteira, e somente quando o relatório próprio dessa suite não mostra
nenhum teste com falha e o orçamento de RPC worker-to-main do Vitest
(`Timeout calling "onTaskUpdate"`) foi o único erro não tratado. Nesse pool esse
formato é contenção de host e não uma regressão — as execuções principais
43018456551 e 43016357976 ficaram vermelhas com 902 de 902 testes passando em
`packages/channels/github`. A primeira tentativa mantém a chamada em lote própria
do npm; somente os workspaces que o npm nomeia como falhos são re-executados, cada
um isoladamente.

A lane de release já concede essa mesma passagem em seus próprios shards
(`.github/scripts/run-release-workspace-tests.sh`), e as regras de evidência são
as que `scripts/tests/release-workflow.test.js` fixa lá: a execução deve ter
alcançado uma contagem de aprovação, não deve ter sido morta por um sinal, e a
contagem própria do Vitest de erros não tratados deve ser igual a quantos timeouts
de transporte o relatório contém. Uma contagem, não o cabeçalho de crash — o
cabeçalho é escolhido pelo produtor, então qualquer padrão sobre cabeçalhos é
incompleto. O número de `Errors` é uma soma sobre o relatório inteiro, enquanto o
número de transporte conta somente dentro das seções `Unhandled Errors` do Vitest
— a saída de console de um teste também é ecoada na coluna 0, então uma cópia
impressa não deve movê-lo — e dentro dessas seções ele corresponde à própria linha
de cabeçalho do erro (um `Error: [vitest-worker]: Timeout calling` na coluna
zero), nunca uma mensagem, stack ou frame de código que meramente cita o prefixo.
A contagem verde de uma tentativa portanto não pode cobrir o crash de uma tentativa
posterior.

As lanes de Linux deliberadamente mantêm erros não tratados como fatais
(`scripts/tests/unit-vitest-configs.test.ts`, #10438), então isso não os ignora:
qualquer teste com falha, qualquer segundo erro não tratado, ou um processo que
morreu antes de reportar recusa o retry. Um travamento que sobreviva a ambas as
tentativas ainda falha. Defina `0` para fazer a primeira falha prevalecer.

**A contagem é o único limite.** Uma re-execução não tem condição de tempo: uma
revisão anterior desta lane pulava uma re-execução quando menos da metade do
orçamento do step de teste restava, e essa guarda foi removida em vez de reparada.
Ela recusou uma re-execução com 74% do orçamento porque adicionava o tempo
decorrido do lote duas vezes, e uma versão correta não está disponível de dentro do
script da lane — o step começa antes do script (`chown -R`, `mktemp`, o amostrador
de disco), então o `SECONDS` próprio do script não é o relógio do step, e passar o
início do step de dentro do workflow seria mais superfície nova do que a única
truncação que evitaria. O custo aceito: uma re-execução emitida tarde o suficiente
pode ser morta pelo `timeout-minutes: 45` do step. Quando isso acontece, o job
falha e o log da primeira tentativa ainda está lá, porque a primeira tentativa é
gravada em um arquivo — uma truncação que mantém a evidência, em vez de uma recusa
que descarta um retry enquanto um quarto do orçamento está sem uso.

### Admissão de carga do host

`QWEN_CI_HOST_LOAD_MAX_RATIO` é o teto de carga por CPU do step
`Host load gate (self-hosted)` nos shards de teste unitário. O gate amostra a
média de carga de cinco minutos de `/proc/loadavg` contra `nproc`, espera até seis
amostras com dez segundos de intervalo, e admite o job assim que uma amostra
ultrapassa o teto. Um host ainda nesse nível ou acima falha o step antes das suites
começarem.

O gate não pode mover um job: o GitHub já o posicionou, e somente uma re-execução
o leva para outro host. O que muda é quando o job falha. O gate de piso de disco ao
lado admite por bytes e inodes livres, que não dizem nada sobre contenção de CPU;
em 2026-11-11 o pool hk1 executou hosts de 64 CPUs com carga 53-98 com 28-140
processos concorrentes do Vitest, e essa ocupação é o que esgota os orçamentos de
teste de 60 segundos, o orçamento de RPC worker-to-main do Vitest, e o orçamento
inteiro de 45 minutos do step de teste. Recusar custa o install já gasto e devolve
esse orçamento, com uma mensagem que diz para re-executar em vez de uma falha de
teste que nenhuma branch autorizou.

**O gate é uma retaguarda, não um preditor.** O padrão `2.0` é calibrado contra a
carga de cinco minutos por CPU dos shards que falharam em 2026-11-11 e de quatro
shards que passaram no mesmo pool na mesma hora:

| Shard | Host   | Na entrada | Mediana | Pico | Resultado              |
| ----- | ------ | ---------- | ------- | ---- | ---------------------- |
| 2/2   | hk1-4  | 1.34       | 1.43    | 1.54 | worker RPC timeout     |
| 2/2   | hk1-30 | 1.45       | 1.42    | 1.54 | worker RPC timeout     |
| 2/2   | hk1-29 | 0.85       | 1.42    | 1.54 | 45-minute step timeout |
| 1/2   | hk1-7  | 0.94       | 1.40    | 1.49 | passed                 |
| 2/2   | hk5-27 | 1.03       | 1.03    | 1.19 | passed                 |
| 1/2   | hk2-32 | 0.75       | 0.97    | 1.18 | passed                 |
| 1/2   | hk3-28 | 0.48       | 0.67    | 0.87 | passed                 |

As faixas se sobrepõem. Um host que passou alcançou 1.49, enquanto um host que
falhou começou em 0.85 — a ocupação cresceu durante a execução, e somente dois dos
três hosts com falha já estavam com contenção quando suas suites começaram. Nenhum
limiar de entrada os separa, então um teto justo o suficiente para pegar os dois
com contenção também recusaria hosts que comprovadamente passam. `2.0` fica acima
de cada leitura medida em um host que completou suas suites: ele recusa um host que
nenhuma dessas amostras sobreviveu, e não teria disparado em nenhum incidente da
tabela. Apertá-lo deve produzir falsas recusas; aumentá-lo muito mais torna o gate
inerte.

O RPC flake nessa tabela é um problema diferente e este gate não é sua correção:
decidi-lo precisa do relatório próprio da suite, que não existe antes das suites
executarem. #16945 adiciona uma re-execução no nível da lane exatamente para esse
formato — um relatório todo verde cujo único erro não tratado foi o timeout de RPC
do worker. Os dois são independentes e podem ser ajustados ou desabilitados
separadamente.

O teto é uma razão, não uma carga absoluta, porque o pool mistura tamanhos de host.
Defina `off` para admitir todo host enquanto a frota está sendo redimensionada. O
gate roda somente em Linux self-hosted; lanes hospedadas pelo GitHub e macOS não
são afetadas, e uma contagem de CPU ou média de carga ilegível, ou um `awk`
ausente, admite o job com um aviso em vez de bloquear uma lane. Um limiar
malformado falha como o erro de configuração que é em vez de desabilitar
silenciosamente o gate.

### Timeout de teste de workspace

`QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES` define o `timeout-minutes` no nível
do job de cada um dos três shards de `workspace_tests` no pipeline de release.
O timeout é dimensionado pelo nível de ocupação do host reservado e não pela
suite em si, então aumente-o quando o host estiver com contenção em vez de
assumir uma regressão de teste.

### Limite de workers do Vitest em runners self-hosted

`QWEN_CI_VITEST_MAX_WORKERS` limita os processos do Vitest nos steps listados
abaixo (`VITEST_MAX_THREADS` / `VITEST_MAX_FORKS`, com o mínimo correspondente
forçado para `1`) nos runners self-hosted reservados cujo nome começa com
`ecs-qwen-`. A variável é exportada apenas pelo step principal de teste de
workspace do CI e pelos steps `workspace_tests` e `quality_scripts` do release;
outros testes de integração que executam o Vitest e caem no mesmo pool
reservado nos workflows de CI e release não a consomem; eles usam seus próprios
limites do Vitest. O smoke E2E do web-shell roda no pool ARM64 com seus próprios dois
workers do Playwright, então o limite não se aplica a ele. Em runners hospedados pelo GitHub, a
variável é ignorada e o Vitest usa seus próprios valores padrão.

Cada execução do Vitest aplica o limite por conta própria. O step principal de teste de workspace do CI executa duas lanes ao mesmo tempo (`.github/scripts/ci/run-unit-test-lanes.sh`): a lane principal executa as suites da CLI e do core no limite, e a lane lateral executa as suites dos outros workspaces e `npm run test:scripts:unit` com metade do limite, no mínimo 1, então no pico o step executa o limite mais essa metade. Em runners hospedados pelo GitHub, as execuções do Vitest da lane lateral usam 2 workers.

O step é executado em dois shards (`Linux unit tests (shard N/2)`), cada um passando `--shard=N/2` para cada uma dessas execuções do Vitest. Os shards também aplicam o limite por conta própria, então o pool vê até dois desses steps ao mesmo tempo. Eles instalam sem o build `prepare` e desempacotam a árvore que o `test_build` construiu uma vez. `Test (ubuntu-latest, Node 22.x)` passa somente quando o build e todos os shards passam.

`test_build` é o único job que faz o build. Ele faz o build através de `scripts/ci-build-cache.mjs`: um pull request restaura o build que o push do commit base dele na `main` salvou (`key --at <base>`), com fallback para o build cacheado mais recente, e reconstrói somente os workspaces cujas entradas mudaram: os arquivos rastreados de um workspace exceto testes, os arquivos raiz, `patches/` e `scripts/` fora de `scripts/tests/`, e os workspaces dos quais ele depende. Um push para `main` sempre faz o build do zero e salva esse build. A chave do cache não carrega arquitetura de CPU: o pool rotulado como x64 inclui hosts ARM64, e a única saída específica de arquitetura, a biblioteca nativa opentui do bundle, é recopiada para o host após cada restauração e desempacotamento (`ci-build-cache.mjs host-assets`).

Os shards de teste unitário, os dois shards de `Integration Tests (no-AK, shard N/2)` e os dois shards de smoke do web-shell desempacotam essa única árvore. `test_build` também executa as verificações que leem essa árvore, o closure do bundle fast-path de serve, as exportações de subpath do core e a verificação de freshness do schema de configurações, que o `Lint & Static` costumava construir.
`Integration Tests (no-AK, No Sandbox)` passa somente quando o build e todos os shards de integração passam. Um pull request draft pula os shards de integração e o smoke do browser; marcá-lo como pronto para revisão inicia a execução que os inclui. Uma mudança confinada a `packages/managed-agent-server/` ou `packages/sdk-java/` (exceto os arquivos que as suites TypeScript leem) é classificada como `java_only`: `Lint & Static` executa seu payload mais as suites `scripts/tests` que nomeiam essas árvores, e as lanes de build e teste TypeScript pulam.

### Variáveis relacionadas fora da execução de testes

`release.yml` também expõe `QWEN_RELEASE_STATIC_TIMEOUT_MINUTES` (padrão `60`,
controlando a lane de lint `quality_static`) e
`QWEN_RELEASE_BUILD_TIMEOUT_MINUTES` (padrão `45`, controlando a lane de
empacotamento `quality_build`). Como elas governam lint estático e builds de
artefatos em vez de execução de testes, estão fora do escopo de execução de
testes desta página.