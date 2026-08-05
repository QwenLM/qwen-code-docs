# Chargement paresseux du SDK OpenTelemetry hors du chemin de démarrage de l'enfant ACP

- **Issue** : #4748 (Optimiser le démarrage à froid du démon et la latence du
  fast-path de qwen serve)
- **Statut** : implémenté
- **Date** : 2026-07-19
- **Dépend de** : #7182 (retrait de modules de la TUI), l'audit de metafile
  ci-dessous

## Problème

`channel.initialize` (~1035 ms P50 sur 2C4G) est le coût dominant de la
première Session à froid du démon, et environ 67 % de ce coût est du
chargement de modules dans l'enfant ACP. Un audit de metafile du bundle
post-#7182 (commit `de962a5ecf`, metafile esbuild avec `DEV=true`) montre que
la closure statique eager de l'enfant ACP est de **17,24 MiB / 2420
modules**, dont le cluster OpenTelemetry est le plus grand bloc cohérent :

| groupe                                                                 | octets (après tree-shake) |
| ---------------------------------------------------------------------- | ------------------------- |
| `@grpc/grpc-js`                                                        | 577 KiB                   |
| `@opentelemetry/otlp-transformer`                                      | 479 KiB                   |
| `protobufjs` + `long` + `@grpc/proto-loader`                           | 305 KiB                   |
| `@opentelemetry/sdk-metrics` / `sdk-node` / `sdk-trace-*` / `sdk-logs` | ~260 KiB                  |
| `@opentelemetry/instrumentation-*` + `instrumentation`                 | ~132 KiB                  |
| `@opentelemetry/*` restants (exporters, propagators, resources, …)     | ~250 KiB                  |
| **total du cluster télémétrie**                                        | **2,16 MiB**              |

Chaque octet de ceci est évalué au démarrage de l'enfant ACP alors que :

1. La télémétrie est **désactivée par défaut** — le cas courant paie la
   totalité de la taxe de modules pour du code que
   `initializeTelemetry()` refuse ensuite d'exécuter (early-return
   `!config.getTelemetryEnabled()` à `sdk.ts:202`).
2. Même activée, rien n'a besoin du SDK avant le premier span/log/metric,
   qui est toujours postérieur à l'ACK de `initialize`.

Pour calibrer : #7182 a retiré 1,16 MiB et réduit le temps d'import ACP de
115 à 52 ms (-63 ms). Ce cluster est presque 2 fois plus gros, donc un effet
du même ordre est plausible — sous réserve de la porte de mesure de l'issue
(ci-dessous).

## Pourquoi la chaîne d'imports est eager

`sdk.ts` importe statiquement tout au niveau supérieur (`sdk.ts:13-32`) : six
exporters OTLP (gRPC + HTTP × traces/logs/metrics), `NodeSDK`, les
processeurs par lot, `PeriodicExportingMetricReader` et les deux
instrumentations. `sdk.ts` lui-même est atteint statiquement depuis le barrel
du cœur via `telemetry/index.ts`, et ne peut pas être rendu entièrement
paresseux car deux modules de chemin chaud dépendent statiquement de son
getter d'état peu coûteux :

- `telemetry/loggers.ts:80` → `isTelemetrySdkInitialized()` (garde chaque
  log)
- `telemetry/session-tracing.ts:31` → idem (garde chaque helper de span)

La scission doit donc séparer la **façade d'état peu coûteuse** de
**l'assemblage lourd du SDK**, et pas seulement envelopper les six imports
d'exporters dans `await import()` — les imports de `NodeSDK` /
instrumentation / sdk-metrics (~0,7 MiB) sont tout aussi supprimables et
vivent dans le même fichier.

## Conception

### Scission de fichiers dans `packages/core/src/telemetry/`

**`sdk.ts` (reste ; devient la façade — aucun import lourd).** Conserve, sans
changer de nom ni de sémantique, tout ce que les autres modules atteignent
statiquement :

- l'état du module : `sdk`, `telemetryInitialized`,
  `telemetryShutdownPromise`, `activeMetricReader` (typé via `import type`
  donc aucun chargement à l'exécution)
- `isTelemetrySdkInitialized()`, `refreshSessionContext()`,
  `shutdownTelemetry()`, `forceFlushMetrics()`
- `resolveHttpOtlpUrl()` (exporté, pur ; aucune dépendance lourde)
- l'effet de bord `diag.setLogger(...)` (a uniquement besoin de
  `@opentelemetry/api`, qui est déjà omniprésent et peu coûteux — 56 KiB,
  aussi utilisé par `loggers.ts`/`metrics.ts`)

Son seul import à l'exécution `@opentelemetry/*` est `@opentelemetry/api`.

**`sdk-impl.ts` (nouveau ; la moitié lourde).** Reçoit tels quels : les six
imports d'exporters OTLP, `NodeSDK`, `BatchSpanProcessor`,
`BatchLogRecordProcessor`, `PeriodicExportingMetricReader`, les deux
instrumentations, `CompressionAlgorithm`, `resourceFromAttributes`,
`SessionIdSpanProcessor`, `parseOtlpEndpoint`, `validateUrl`,
`normalizeOtlpPrefix` + la correspondance de préfixe, la porte du
propagator, et le corps du `initializeTelemetry()` actuel à partir de la
construction de la ressource. Il exporte une fonction :

```ts
export function startTelemetrySdk(config: TelemetryRuntimeConfig):
  | {
      sdk: NodeSDK;
      metricReader: PeriodicExportingMetricReader | undefined;
    }
  | undefined;
```

renvoyant `undefined` sur le chemin de saut existant « gRPC sans endpoint de
base ». `file-exporters.ts` et `log-to-span-processor.ts` passent aussi
derrière `sdk-impl.ts` (ils ne sont importés que par `sdk.ts` aujourd'hui,
et tirent `sdk-logs`/`sdk-metrics`/`sdk-trace-base`).

### `initializeTelemetry` devient async

Dans la façade :

```ts
let telemetryInitPromise: Promise<void> | undefined;

export function initializeTelemetry(
  config: TelemetryRuntimeConfig,
): Promise<void> {
  if (telemetryInitialized || !config.getTelemetryEnabled()) {
    return Promise.resolve();
  }
  telemetryInitPromise ??= (async () => {
    const { startTelemetrySdk } = await import('./sdk-impl.js');
    const started = startTelemetrySdk(config);
    if (!started) return;
    sdk = started.sdk;
    // sdk.start() + telemetryInitialized = true + setSessionContext +
    // setShellTracePropagation + initializeMetrics — même ordre
    // qu'aujourd'hui, même try/catch qui ne fait que journaliser.
  })().finally(() => {
    telemetryInitPromise = undefined;
  });
  return telemetryInitPromise;
}
```

Propriétés clés :

- **Le chemin désactivé reste synchrone et gratuit** — la vérification
  `getTelemetryEnabled()` s'exécute avant l'import dynamique, donc les
  utilisateurs de la configuration par défaut ne chargent jamais le cluster
  de 2,16 MiB. C'est le gain réel pour l'enfant ACP.
- La garde single-flight (`telemetryInitPromise`) garde la fonction
  idempotente sous des appelants concurrents, en cohérence avec la
  re-vérification `telemetryInitialized` d'aujourd'hui.
- `shutdownTelemetry()` ne nécessite aucun changement : elle opère sur la
  variable `sdk` de la façade et est déjà no-op quand
  `!telemetryInitialized`.

### Traitement des sites d'appel (les trois appelants de production)

1. **`packages/core/src/config/config.ts:2192`** (constructeur de Config —
   contexte synchrone ; c'est le chemin que prend l'enfant ACP car
   `deferTelemetryInitialization` est faux pour le mode ACP, voir
   `packages/cli/src/config/config.ts:2075`). Fire-and-forget avec un catch
   journalisé :

   ```ts
   void initializeTelemetry(this).catch(...)
   ```

   Analyse de risque : la seule conséquence d'un démarrage tardif est que les
   spans/logs émis dans l'intervalle sont abandonnés par les gardes
   `isTelemetrySdkInitialized()` — ce qui est _déjà_ le comportement pour
   toute la fenêtre pré-constructeur et pour le chemin TUI interactif, où
   l'init de la télémétrie est différée à une tâche en arrière-plan
   (`startup-prefetch.ts:259`). Aucun nouveau mode d'échec.

   Changement de comportement (intentionnel, documenté) : sur les chemins non
   différés — l'enfant ACP et les exécutions headless `-p`, où
   `deferTelemetryInitialization` est faux — la télémétrie était auparavant
   entièrement enregistrée au moment où l'appel synchrone
   `initializeTelemetry` retournait ; elle se stabilise désormais de manière
   asynchrone, donc la fenêtre d'abandon existante s'élargit du coût de
   l'import dynamique (~50–150 ms). Nous ne faisons _pas_ `await` ici
   exprès : attendre remettrait l'import de 2,16 MiB sur le chemin critique
   de l'enfant ACP et annulerait le gain. Les appelants qui ont besoin que
   la télémétrie soit garantie prête avant de continuer (le runtime du démon,
   appelant 3) font `await` explicitement.

2. **`packages/cli/src/startup/startup-prefetch.ts:261`** (exécuteur de
   tâches différées). Modifier la fermeture de la tâche pour renvoyer la
   promesse (`() => initializeTelemetry(config)`) afin que la gestion
   d'erreur existante de `runDeferredTask` observe les rejets. La sémantique
   est inchangée par ailleurs.

3. **`packages/cli/src/serve/run-qwen-serve.ts:2925`** (runtime du démon).
   **Doit faire `await`.** La ligne juste après appelle
   `initializeDaemonMetrics()`, et `metrics.getMeter()` d'OTel met
   définitivement en cache un meter noop s'il est appelé avant que le SDK
   enregistre le MeterProvider global — les métriques du démon mourraient en
   silence. La fonction englobante est déjà async, donc `await
core.initializeTelemetry(...)` est un changement d'un mot. Cela ajoute le
   coût de chargement des modules au chargement du _runtime du démon_
   (différé, hors du fast path) uniquement quand la télémétrie est activée —
   acceptable, et strictement mieux que de le payer dans chaque enfant ACP.

   Le même risque d'ordre existe en principe pour `initializeMetrics()`
   (`metrics.ts:409`), mais il est appelé _à l'intérieur_ de la promesse
   d'init après `sdk.start()`, donc l'ordre est préservé par construction.

### Extension de la garde de bundle

Étendre la vérification de frontière ACP de
`scripts/check-serve-fast-path-bundle.js`
(`findAcpImportBoundaryOffenders`) avec une liste noire de télémétrie afin
que la scission ne puisse pas régresser silencieusement :

```
@grpc/grpc-js, @grpc/proto-loader, protobufjs,
@opentelemetry/otlp-transformer, @opentelemetry/sdk-node,
@opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/exporter-logs-otlp-grpc,
@opentelemetry/exporter-metrics-otlp-grpc,
@opentelemetry/instrumentation-http, @opentelemetry/instrumentation-undici
```

(`@opentelemetry/api`, `semantic-conventions`, `core`, `resources`,
`api-logs` restent hors de la liste noire — ils sont légitimement atteints
depuis `loggers.ts`, `metrics.ts` et les exports de niveau type.)

## Ce que cela ne change PAS

- Aucun changement de comportement quand la télémétrie est activée — mêmes
  exporters, mêmes processeurs, mêmes hooks d'instrumentation, mêmes
  sémantiques de shutdown/flush.
- Aucune suppression d'API publique : le type de retour de
  `initializeTelemetry` change de `void → Promise<void>`, ce qui est
  source-compatible pour les appelants fire-and-forget existants (tous les
  sites d'appel sont mis à jour dans le même commit de toute façon ; c'est
  un changement du package core, rédigé par les mainteneurs selon AGENTS.md).
- Les exports du barrel `telemetry/index.ts` gardent les mêmes noms.

## Acceptation (porte de mesure de l'issue #4748)

Les comptes en octets ne se convertissent pas en millisecondes ; le
changement doit passer la discipline établie de l'issue avant fusion :

1. **2C4G, 30 démarrages à froid séquentiels**, télémétrie désactivée
   (configuration par défaut) : comparer les P50/P95 de `channel.initialize`
   et le P50 process→première Session à la baseline `de962a5ecf`. Ne livrer
   que si le P50 s'améliore au-delà du bruit entre exécutions.
2. **Passage fonctionnel avec télémétrie activée** : les cibles OTLP gRPC et
   HTTP reçoivent chacune des traces/logs/metrics après le changement
   (matrice existante de `sdk.test.ts`, plus un end-to-end manuel contre un
   collecteur local) ; les exporters fichier `--telemetry-outfile` écrivent
   toujours.
3. **Métriques du démon** : avec la télémétrie activée, les métriques de
   Status du démon sonnent et les gauges de `initializeDaemonMetrics()`
   rapportent toujours (garde le await au site d'appel 3).
4. **Garde de bundle** : `node scripts/check-serve-fast-path-bundle.js` au
   vert avec la liste noire étendue ; réexécuter l'audit de closure
   (`.qwen/scripts/acp-closure-audit.mjs`) et enregistrer le nouveau total
   de la closure ACP (attendu ≈ 17,24 − ~2,0 MiB, moins ce que
   `@opentelemetry/api` et compagnie gardent en eager).
5. **Tests unitaires** : `sdk.test.ts` fait `await` sur
   `initializeTelemetry` (15 sites d'appel) ; les tests qui affirment la
   construction des exporters passent à `sdk-impl.ts` ou le mockent.

## Alternatives considérées

- **Importer paresseusement uniquement les six classes d'exporters, garder
  `initializeTelemetry` synchrone.** Rejeté : laisse ~0,7 MiB (`NodeSDK`,
  instrumentations, `sdk-metrics`, processeurs par lot) en eager sans
  raison, et force quand même une frontière async quelque part — le chemin
  activé construit les exporters inconditionnellement, donc la fonction
  devient async dans les deux cas.
- **Rendre dynamique le module `telemetry/sdk.ts` entier.** Rejeté :
  `loggers.ts` et `session-tracing.ts` gardent chaque appel de télémétrie
  avec `isTelemetrySdkInitialized()` ; rendre cette garde async
  empoisonnerait des dizaines de sites d'appel synchrones chauds.
- **Sauter entièrement la télémétrie dans l'enfant ACP.** Déjà rejeté dans
  l'issue (les sauts généraux changent le comportement observable pour les
  utilisateurs qui activent la télémétrie).
