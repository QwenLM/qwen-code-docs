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
| `QWEN_RELEASE_VITEST_RETRY`                | `2`    | `release.yml`           | Contagem de retries para os shards de teste de workspace do release                         |
| `QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES`   | `45`   | `release.yml`           | Timeout do job de cada shard de teste de workspace do release                               |
| `QWEN_CI_VITEST_MAX_WORKERS`               | `4`    | `ci.yml`, `release.yml` | Limite de workers para testes unitários do CI principal e testes de workspace/quality do release em runners reservados |

### Contagens de retry

`QWEN_CI_VITEST_RETRY` e `QWEN_RELEASE_VITEST_RETRY` são passados ao Vitest
como `--retry=<n>` no step principal de teste do CI (`npm run test:ci:workspaces`
e `npm run test:scripts`) e na lane de release
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
limites do Vitest. O smoke E2E da Web Shell está fixado em `ubuntu-latest`,
então o limite não se aplica a ele. Em runners hospedados pelo GitHub, a
variável é ignorada e o Vitest usa seus próprios valores padrão.

### Variáveis relacionadas fora da execução de testes

`release.yml` também expõe `QWEN_RELEASE_STATIC_TIMEOUT_MINUTES` (padrão `60`,
controlando a lane de lint `quality_static`) e
`QWEN_RELEASE_BUILD_TIMEOUT_MINUTES` (padrão `45`, controlando a lane de
empacotamento `quality_build`). Como elas governam lint estático e builds de
artefatos em vez de execução de testes, estão fora do escopo de execução de
testes desta página.