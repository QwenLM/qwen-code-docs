# Chargement paresseux d'undici (démarrage paresseux phase 3)

- Statut : implémenté
- Issue : QwenLM/qwen-code#7264 (candidat 4), suite de #4748
- Prédécesseurs : `2026-07-19-lazy-telemetry-sdk-loading.md`,
  `2026-07-19-telemetry-protocol-split.md`

## Problème

Après les phases de télémétrie, undici est le plus gros contributeur tiers
restant à la closure eager de démarrage ACP : 2057 KiB répartis sur deux
copies bundlées (cli résout son propre `undici`, core en résout un autre).
Chaque `import { … } from 'undici'` statique n'importe où dans la closure
tire une copie complète dans le parse/compile du démarrage à froid, alors
qu'undici n'est nécessaire que lorsqu'une requête sort réellement —
dispatchers de proxy, préconnexion, options de fetch du client IDE,
configuration GitHub, auto-mise à jour.

Le metafile montrait huit sites d'imports de valeurs (les imports
type-only sont gratuits) :

| Package | Site                           | Utilisations                               |
| ------- | ------------------------------ | ------------------------------------------ |
| core    | `utils/runtimeFetchOptions.ts` | `Agent`, `ProxyAgent`, `EnvHttpProxyAgent` |
| core    | `config/config.ts`             | `EnvHttpProxyAgent`, `setGlobalDispatcher` |
| core    | `ide/ide-client.ts`            | `Agent` (keep-alive HTTP de l'IDE)         |
| cli     | `utils/apiPreconnect.ts`       | `fetch`                                    |
| cli     | `commands/channel/proxy.ts`    | `EnvHttpProxyAgent`, `setGlobalDispatcher` |
| cli     | `utils/gitUtils.ts`            | `ProxyAgent`                               |
| cli     | `services/setup-github.ts`     | `ProxyAgent`                               |
| cli     | `utils/standalone-update.ts`   | `fetch`                                    |

## Conception

Les huit sites passent à `import('undici')` dynamique, canalisés à travers
deux helpers single-flight locaux à chaque package :

- `packages/core/src/utils/runtimeFetchOptions.ts` — `loadUndici()`, plus le
  `preloadRuntimeFetchModule()` existant qui lui délègue désormais. Les
  consommateurs synchrones (`getOrCreateSharedDispatcher`,
  `buildFetchOptionsWithDispatcher`) gardent leur `requireUndici()` qui
  échoue bruyamment ; les points d'entrée asynchrones qui peuvent attendre
  (`createContentGenerator`, `Config.initialize`, la connexion du client
  IDE) préchargent avant que toute construction synchrone ne s'exécute.
- `packages/cli/src/utils/load-undici.ts` — le même helper, dupliqué
  exprès (voir « Pourquoi deux helpers »).

Notes sur les sites d'appel :

- `Config` : le dispatcher de proxy global s'installe de manière asynchrone ;
  la promesse est stockée et attendue au début de `initialize()`, afin que le
  dispatcher soit en place avant toute activité réseau, en cohérence avec la
  garantie d'ordre synchrone précédente.
- `createContentGenerator` attend `preloadRuntimeFetchModule()` avant que les
  constructeurs de provider ne construisent de manière synchrone des options
  de fetch basées sur undici.

## Interop CJS d'esbuild (la partie difficile)

esbuild compile le package CJS undici en un chunk dynamique **default-only** :
`export default require_undici()`, sans exports nommés. Donc
`const { Agent } = await import('undici')` fonctionne dans Node et vitest
(qui synthétisent des exports nommés pour le CJS) mais déstructure
`undefined` dans le bundle. Les exécutions de test locales ne peuvent pas
détecter cela — seule une exécution de smoke bundlée le peut.

`loadUndici()` normalise donc : si `Object.keys(mod)` est exactement
`['default']`, déballer `mod.default` ; sinon renvoyer le namespace tel quel.
La vérification à clé unique (plutôt que `mod.default ?? mod` ou
`'default' in mod`) est délibérée :

- les proxies de mock de vitest **lèvent une exception** à l'accès à un
  export `default` indéfini, donc sonder `mod.default` casse chaque test
  `vi.mock('undici')` ;
- les mocks construits sous la forme `{ ...actual }` peuvent porter une clé
  `default` à côté des exports nommés et ne doivent pas être déballés.

## Pourquoi deux helpers (et pas un seul exporté depuis core)

cli et core résolvent des copies **différentes** d'undici. Si le code de cli
appelait un `loadUndici()` hébergé par core, le `import('undici')` se
résoudrait à l'intérieur de la portée du package core, échappant au
`vi.mock('undici')` dans les tests de cli — les mocks cesseraient
silencieusement d'intercepter (observé : le mock `ProxyAgent` jamais appelé
dans `setup-github.test.ts`). Garder un helper par package permet aux tests
de chaque package de mocker leur propre undici.

## Garde

`scripts/check-serve-fast-path-bundle.js` ajoute undici à
`FORBIDDEN_ACP_PACKAGES` : un ré-import statique n'importe où dans la
closure eager ACP fait échouer la CI. Après le changement, la closure eager
passe de 15,42 MiB / 132 chunks à 13,39 MiB / 130 chunks, les octets d'undici
de 2057 KiB à 0 ; le bundle conserve exactement deux chunks d'entrée undici
dynamiques (un par copie de package), tous deux derrière les helpers de
normalisation.

## Acceptation (2C4G, discipline de #4748)

30 démarrages à froid séquentiels appariés, contrôle = build de la phase 2,
candidat = ce changement : P50 apparié process→première session −89,5 ms
(1336,8 → 1255,2), candidat plus rapide dans 30/30 paires ; chemin préchauffé
inchangé (P50 80,7 → 78,0) ; RSS après la première session −8,1 MB. Les
portes fonctionnelles (concurrence, télémétrie désactivée, session unique
legacy) passent toutes. Les chiffres complets sont dans
`.qwen/e2e-tests/phase3-lazy-undici-bench-results.md`.

## Alternatives rejetées

- **Un seul helper partagé exporté depuis core** : casse les mocks de test
  de cli et couple la copie d'undici de cli à celle de core (les deux copies
  sont déjà sur des versions différentes à HEAD : 7.27.2 contre 7.28.0).
- **Préchargement eager au premier niveau déclenché au démarrage** : ne
  retire le coût de parse du chemin critique que si rien ne l'attend, mais
  tout l'intérêt est que la plupart des démarrages à froid n'ont jamais
  besoin d'undici avant la première session ; le préchargement réajouterait
  la compétition CPU sur 2 cœurs mesurée en phase 2.
- **Remplacer l'usage d'undici par le `fetch` global** : le fetch global de
  Node est undici, mais le code a besoin des options de dispatcher
  `Agent`/`ProxyAgent`/`EnvHttpProxyAgent` que la surface globale n'expose
  pas.
