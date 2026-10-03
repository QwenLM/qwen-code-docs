# Variables de CI et de release

Plusieurs knobs des pipelines de CI et de release sont exposés en tant que
variables de dépôt GitHub Actions (le contexte `vars.*`) afin que les
opérateurs puissent les ajuster sans ouvrir de pull request. Cette page liste
les variables qui affectent l'exécution des tests dans
`.github/workflows/ci.yml` et `.github/workflows/release.yml`, ainsi que leurs
valeurs par défaut et leur champ d'application.

## Définir une variable

Les mainteneurs du dépôt définissent ces variables sous **Settings → Secrets
and variables → Actions → Variables**. Une variable non définie (ou vide)
utilise le fallback dans l'expression du workflow. La limite de workers
s'applique uniquement sur les runners réservés, même lorsque sa variable est
définie.

Les fichiers de workflow sont la source de vérité pour ces leviers, et les
suites de tests épinglent les expressions du workflow octet pour octet :
`scripts/tests/package-scripts.test.js` épingle l'expression partagée de
limite de workers dans `release.yml` (`QWEN_CI_VITEST_MAX_WORKERS` avec la
garde `ecs-qwen-`), `scripts/tests/no-ak-integration-ci.test.js` épingle
l'expression de limite de workers dans `ci.yml`, et
`scripts/tests/release-workflow.test.js` épingle les expressions de retry et
de timeout de test de workspace de `release.yml`.
`scripts/tests/package-scripts.test.js` vérifie également les valeurs par
défaut documentées et les emplacements de workflow par rapport aux deux
workflows. Comme cette garde s'exécute sur la lane CI complète
(`test:scripts`) plutôt que sur les vérifications docs uniquement, vérifiez
les modifications limitées à cette page en local avant d'ouvrir une pull
request avec `npm run test:scripts` (ou
`npx vitest run --config ./scripts/tests/vitest.config.ts scripts/tests/package-scripts.test.js`).
Si les docs et les workflows divergent un jour, faites confiance aux
workflows et mettez à jour cette page dans le même changement.

## Variables

| Variable                                 | Défaut | Utilisée dans            | Contrôle                                                                                       |
| ---------------------------------------- | ------ | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `QWEN_CI_VITEST_RETRY`                   | `2`    | `ci.yml`                 | Nombre de retries pour l'étape de test principale CI workspace et scripts                      |
| `QWEN_RELEASE_VITEST_RETRY`              | `2`    | `release.yml`            | Nombre de retries pour les shards de test workspace de release                                 |
| `QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES` | `45`   | `release.yml`            | Timeout de job de chaque shard de test workspace de release                                    |
| `QWEN_CI_VITEST_MAX_WORKERS`             | `4`    | `ci.yml`, `release.yml`  | Limite de workers pour les tests unitaires CI principaux et les tests workspace/qualité de release sur les runners réservés |

### Nombre de retries

`QWEN_CI_VITEST_RETRY` et `QWEN_RELEASE_VITEST_RETRY` sont passés à Vitest
sous la forme `--retry=<n>` dans l'étape de test CI principale
(`npm run test:ci:workspaces` et `npm run test:scripts`) et sur la lane de
release (`npm run test:release:workspaces`) respectivement. Les deux lanes ont
des variables séparées afin de pouvoir être ajustées indépendamment.

Vitest relance les tests en échec au sein du même run. Cela peut aider en cas
de contentions intermittentes, mais un échec qui récupère dans le budget de
retries valide le check et n'est pas enregistré comme un échec par le tracker
de flaky-rerun. Gardez le budget modeste au lieu d'utiliser les retries pour
masquer une suite instable. Les deux variables acceptent également la valeur
littérale `off`, qui omet entièrement le flag `--retry` au lieu de passer
`--retry=0` (un `--retry=0` en ligne de commande prend le pas sur la config
Vitest du workspace et désactiverait une politique de retry délibérée).

### Timeout de test workspace

`QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES` définit le `timeout-minutes` au
niveau du job pour chacun des trois shards `workspace_tests` dans le pipeline
de release. Le timeout est dimensionné en fonction de la charge de l'hôte
réservé plutôt que par la suite elle-même, augmentez-le donc lorsque l'hôte
est en contention plutôt que de supposer une régression de test.

### Limite de workers Vitest sur les runners auto-hébergés

`QWEN_CI_VITEST_MAX_WORKERS` limite les processus Vitest dans les étapes
listées ci-dessous (`VITEST_MAX_THREADS` / `VITEST_MAX_FORKS`, avec le minimum
correspondant forcé à `1`) sur les runners auto-hébergés réservés dont le nom
commence par `ecs-qwen-`. La variable est exportée uniquement par l'étape de
test workspace CI principale et les étapes `workspace_tests` et
`quality_scripts` de release ; les autres tests d'intégration exécutant Vitest
qui arrivent dans le même pool réservé dans les workflows CI et release ne la
consomment pas ; ils utilisent leurs propres limites Vitest. Le smoke E2E
web-shell est épinglé sur `ubuntu-latest`, la limite ne peut donc pas
s'appliquer. Sur les runners hébergés par GitHub, la variable est ignorée et
Vitest utilise ses propres valeurs par défaut.

### Variables associées hors exécution de tests

`release.yml` expose également `QWEN_RELEASE_STATIC_TIMEOUT_MINUTES` (défaut
`60`, contrôlant la lane lint `quality_static`) et
`QWEN_RELEASE_BUILD_TIMEOUT_MINUTES` (défaut `45`, contrôlant la lane de
packaging `quality_build`). Comme elles régissent le lint statique et la
construction d'artifacts plutôt que l'exécution de tests, elles sont hors du
champ d'exécution de tests de cette page.