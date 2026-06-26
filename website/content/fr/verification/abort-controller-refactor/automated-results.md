# Résultats de vérification automatisée

Capturé le 20 mai 2026 lors du refactoring d'AbortController.

## 1. Reproduceteur d'accumulation d'écouteurs

Simulation directe du motif d'accumulation d'écouteurs observé dans les sessions
longues (1500+ écouteurs d'abandon sur un seul AbortSignal). Le script se trouve
dans `listener-accumulation-repro.mjs`.

```text
$ node docs/verification/abort-controller-refactor/listener-accumulation-repro.mjs
Simulating 2000 rounds for each pattern.

OLD pattern listener count on long-lived parent: 2000
NEW pattern listener count on long-lived parent: 0
PASS: OLD pattern accumulated >1500 listeners (reproduces the bug).
PASS: NEW pattern kept listener count at 0 — the helper prevents accumulation.
```

Ceci est une preuve autonome : le motif ANCIEN (`addEventListener` brut sans
`{once:true}` ni nettoyage inverse) accumule 2000 écouteurs sur 2000 rounds —
bien au-delà du seuil de 1500 observé par l'utilisateur. Le motif NOUVEAU
(`createChildAbortController` depuis `packages/core/src/utils/abortController.ts`)
maintient le compteur d'écouteurs parents à 0 sur 2000 rounds car chaque
écouteur de nettoyage inverse de l'enfant supprime l'écouteur parent lorsque
l'enfant abandonne.

## 2. Périmètre de migration (intentionnel)

Seule la chaîne parent→enfant du runtime d'agent qui accumule réellement des
écouteurs sur un signal parent de longue durée est migrée vers l'utilitaire :

- `packages/core/src/agents/runtime/agent-interactive.ts` (round maître + par message)
- `packages/core/src/agents/runtime/agent-core.ts` (round par itération + waitForExternalInputs + essai/sauf final de processFunctionCalls)
- `packages/core/src/agents/runtime/agent-headless.ts` (externe → exécution)
- `packages/core/src/hooks/promptHookRunner.ts` (avait une vraie fuite de nettoyage : addEventListener manuel sans `{once:true}` et jamais supprimé)

De plus, trois corrections uniquement `{once:true}` (pas de changement d'utilitaire, juste une correction défensive) :

- `packages/core/src/hooks/hookRunner.ts`
- `packages/core/src/hooks/functionHookRunner.ts`
- `packages/core/src/confirmation-bus/message-bus.ts`

Les contrôleurs indépendants de courte durée (par commande shell dans `tools/shell.ts`,
par moniteur dans `tools/monitor.ts`, par session arène dans
`agents/arena/ArenaManager.ts`, par rappel dans `core/client.ts`,
par fetch dans `utils/fetch.ts`, par rêve / par titre / par juge / par reprise,
etc.) restent avec le `new AbortController()` brut — ils sont libérés par le GC
en fin d'utilisation et ne s'accumulent pas sur un parent de longue durée.

Voir `migration-completeness.txt` pour le grep réel et la justification.

## 3. Suites de tests affectées

Les 71 fichiers de tests affectés / 2085 tests passent (3 ignorés — 1 est le test
GC qui nécessite `--expose-gc`, 2 sont des ignorés préexistants dans la suite
headless).

```text
 Test Files  71 passed (71)
      Tests  2085 passed | 3 skipped (2088)
   Duration  16.71s
```

Couverture :

- `packages/core/src/utils/abortController.test.ts` — 26 tests : limite du factory (par défaut + personnalisé), propagation enfant, nettoyage inverse, chemin rapide, parent indéfini, passage de custom-maxListeners, sémantique de `combineAbortSignals` (incl. nettoyage-annule-timeout, timeout-nettoie-écouteurs d'entrée, limite `timeoutMs <= 0`, vérification défensive en milieu d'itération), sécurité GC (meilleur effort).
- `packages/cli/src/utils/warningHandler.test.ts` — 13 tests : idempotence, suppression AbortSignal (incl. forme `[AbortSignal{...}]`), EventTarget générique NON supprimé, passage en mode debug, diffusion vers les écouteurs antérieurs, intégration stderr de bout en bout des processus enfants.
- `packages/core/src/hooks/httpHookRunner.test.ts` — couvre le consommateur migré de `combineAbortSignals` (le shim déprécié `createCombinedAbortSignal` ainsi que son fichier de test ont été supprimés une fois l'unique appelant migré).
- `packages/core/src/agents/runtime/{agent-core,agent-interactive,agent-headless,agent-context,agent-statistics}.test.ts` — 102 tests couvrant les fichiers migrés à fort impact.
- `packages/core/src/core/openaiContentGenerator/**` — 280+ tests incluant le pipeline qui a perdu le pansement `raiseAbortListenerCap`.
- `packages/core/src/followup/**` — 100+ tests incluant le contrôleur de spéculation migré.
- `packages/core/src/tools/agent/**`, `packages/core/src/tools/shell.test.ts`, `packages/core/src/services/**`, `packages/core/src/hooks/**`, `packages/core/src/confirmation-bus/**` — tous les fichiers d'outils/hooks/services migrés.

## 4. Vérification de type en mode strict TypeScript

```sh
$ node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit
(no output, exit 0)

$ node_modules/.bin/tsc -p packages/cli/tsconfig.json --noEmit
(no output, exit 0)
```

## 5. Formatage Prettier

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

## 6. Build + test de validation du binaire

```sh
$ npm run build:packages
(succeeds for all 5 workspace packages)

$ NODE_OPTIONS=--trace-warnings node packages/cli/dist/index.js --version
0.15.11
EXIT=0

$ node packages/cli/dist/index.js --help
Usage: qwen [options] [command]
...
```

Aucun avertissement émis au démarrage avec `--trace-warnings`.

## 7. Révision indépendante par Codex

Deux passages complets via l'agent `codex:codex-rescue` (contexte indépendant
à chaque fois). Le premier passage a révélé 3 problèmes — tous traités dans
les commits suivants :

1. **Throw entre la création du contrôleur et l'abandon explicite fuit l'écouteur**
   dans le corps par itération de `agent-core.ts` et la configuration avant
   le bloc try de `agent-headless.ts`. Corrigé en enveloppant chacun dans
   `try { ... } finally { abortController.abort(); }`.
2. **L'expression régulière du suppresseur d'avertissement `EventTarget` trop large**.
   Restreinte pour correspondre uniquement à `AbortSignal` (toute forme que
   Node ≥20 produit).
3. **`process.removeAllListeners('warning')` supprime les écouteurs tiers**.
   Supprimé — se fier à la sémantique "aucun écouteur → déclencheur par défaut
   s'affiche" de Node, donc ajouter notre gestionnaire désactive implicitement
   le chemin d'affichage par défaut tout en conservant intacts les écouteurs
   de télémétrie tiers.

Le second passage a confirmé toutes les corrections, aucun autre blocage.

## Ce qui reste pour la vérification interactive

Les scénarios numérotés 00 à 09 dans `README.md` nécessitent une session
interactive réelle avec l'API du modèle (longues conversations avec outils
mixtes, Ctrl-C en cours de flux, annulation de sous-agent, instantanés du
tas). Ceux-ci sont documentés pour exécution humaine et les transcriptions
doivent être jointes au corps de la PR lors de l'exécution.