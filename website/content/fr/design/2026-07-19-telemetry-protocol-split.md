# Scission de protocole des exporters de télémétrie (SDK paresseux phase 2)

- Statut : implémenté
- Issue : QwenLM/qwen-code#7264 (candidat 1), suite de #4748
- Prédécesseur : `2026-07-19-lazy-telemetry-sdk-loading.md` (scission façade /
  impl)

## Problème

La phase 1 a placé tout le SDK de télémétrie derrière un `import()`
dynamique, de sorte que les processus avec télémétrie désactivée ne chargent
rien. Mais les processus avec télémétrie **activée** chargent toujours la
closure statique complète de `sdk-impl.ts`, qui embarque les deux chaînes de
protocole OTLP quelle que soit celle que la configuration sélectionne :

| Cluster                                                                                                              | Taille (metafile, de962a5ecf + phase 1) | Requis par                            |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------- |
| Chaîne gRPC (`@grpc/grpc-js`, `protobufjs`, `@grpc/proto-loader`, `exporter-*-otlp-grpc`, `long`, `lodash.camelcase`) | 1121 KiB / 125 modules               | `otlpProtocol: 'grpc'` uniquement     |
| Chaîne HTTP (`exporter-*-otlp-http`)                                                                                 | 23 KiB / 17 modules                     | `otlpProtocol: 'http'` uniquement     |
| Couche OTLP partagée (`otlp-transformer`, `otlp-exporter-base`)                                                      | 915 KiB / 41 modules                    | les deux protocoles OTLP, **pas** outfile |

Le metafile montre deux importeurs statiques de la surface OTLP en dehors des
packages d'exporters eux-mêmes :

1. `sdk-impl.ts` (son import de `CompressionAlgorithm`) — supprimé en
   déplaçant la construction des exporters dans les modules de protocole.
2. `@opentelemetry/sdk-node` lui-même — son `utils.js`/`sdk.js` fait
   eagèrement `require()` de chaque package d'exporters (otlp
   proto/http/grpc × 3 signaux, zipkin, prometheus) pour prendre en charge
   l'auto-configuration basée sur les variables d'environnement `OTEL_*_EXPORTER`.
   qwen-code n'atteint jamais ces chemins de code : il passe toujours des
   `spanProcessors` / `logRecordProcessors` explicites (un tableau vide
   court-circuite quand même le fallback sur l'environnement). Traité par un
   stub au moment du bundle, voir ci-dessous.

Une fois les deux coupés, la scission retire la totalité de la surface OTLP
du chemin outfile, la chaîne gRPC du chemin HTTP, et la chaîne HTTP du chemin
gRPC.

Le benchmark 2C4G de la phase 1 a montré pourquoi cela compte : avec la
télémétrie activée (outfile), le chargement dynamique de sdk-impl entre en
compétition pour le CPU avec la mise en place de la session sur 2 cœurs
(`config_construction`/`bootstrap` +50 ms), absorbant l'essentiel du gain de
−50 ms sur la chaîne d'imports. Réduire ce qui est réellement chargé réduit
cette compétition.

## Conception

Deux nouveaux modules possèdent la construction des exporters, chargés via
`import()` dynamique depuis `startTelemetrySdk` uniquement sur leur branche
de configuration respective :

- `packages/core/src/telemetry/sdk-exporters-grpc.ts`
  - Importe les trois exporters gRPC + `CompressionAlgorithm` +
    `PeriodicExportingMetricReader`.
  - `createGrpcExporters(endpoint)` → `{ spanExporter, logExporter, metricReader }`,
    tous compressés en gzip, correspondant exactement à la construction
    actuelle.
- `packages/core/src/telemetry/sdk-exporters-http.ts`
  - Importe les trois exporters HTTP + `PeriodicExportingMetricReader` +
    `LogToSpanProcessor`.
  - `createHttpExporters({ tracesUrl, logsUrl, metricsUrl, logToSpan })` →
    `{ spanExporter?, logExporter?, metricReader?, logToSpanProcessor? }`.
    La décision du bridge logs→spans (endpoint de logs absent, traces
    présentes) déménage ici avec lui, puisque le bridge construit un exporter
    de traces HTTP.

Changements de `sdk-impl.ts` :

- Supprime les six imports d'exporters et `CompressionAlgorithm` ; les
  variables d'exporters sont typées contre les interfaces du SDK
  (`SpanExporter`, `LogRecordExporter`) dont il dépend déjà.
- `startTelemetrySdk` devient `async`. L'ordre des branches est préservé :
  - gRPC sans endpoint de base renvoie toujours `undefined` **avant** tout
    chargement de module de protocole.
  - La validation des URL HTTP (`validateUrl`) reste dans `sdk-impl.ts` ; le
    module HTTP n'est importé que lorsque au moins une URL de signal passe la
    validation.
  - La branche outfile ne touche aucun module de protocole.
- La façade fait `await` sur `startTelemetrySdk` (elle s'exécute déjà à
  l'intérieur de la fermeture async single-flight, donc aucun changement
  visible par l'appelant).

`esbuild.config.js` gagne `sdkNodeExporterStubPlugin` : lorsque — et
seulement lorsque — l'importeur est `@opentelemetry/sdk-node`, les packages
d'exporters se résolvent vers un stub dont les constructeurs lèvent une
exception. Nos modules de protocole continuent de résoudre les vrais
packages. sdk-node ne touche ces bindings qu'à l'intérieur de ses fonctions
de configuration pilotées par l'environnement, que les arguments explicites
de processeurs de qwen-code rendent inatteignables pour les traces et les
logs ; le seul chemin atteignable (`OTEL_METRICS_EXPORTER=otlp` etc.) lève
désormais une exception à l'intérieur de `NodeSDK.start()` — rattrapée par le
try/catch existant de la façade — au lieu d'exporter silencieusement vers un
endpoint localhost par défaut. La sélection d'exporter basée sur
l'environnement n'a jamais été une surface de configuration prise en charge
de qwen-code.

Ce que chaque configuration charge après la scission (closure statique
mesurée de chaque chunk d'entrée bundlé) :

| Config    | Charge                                            | Saute                |
| --------- | ------------------------------------------------- | -------------------- |
| outfile   | closure de sdk-impl uniquement (975 KiB)          | les deux chaînes de protocole |
| OTLP http | + closure de la chaîne HTTP (1,2 MiB couche partagée incluse) | cluster gRPC |
| OTLP grpc | + closure de la chaîne gRPC (1,9 MiB couche partagée incluse) | exporters HTTP |

## Garde

`scripts/check-serve-fast-path-bundle.js` gagne une vérification enracinée
sur le chunk `sdk-impl` : sa closure d'imports statiques ne doit atteindre
aucun membre de `FORBIDDEN_OTLP_PROTOCOL_PACKAGES` — le cluster gRPC
(`@grpc/grpc-js`, `@grpc/proto-loader`, `protobufjs`,
`exporter-*-otlp-grpc`) plus `@opentelemetry/otlp-transformer`, qui siège
dans la couche de sérialisation partagée que les deux chaînes de protocole
tirent et attrape donc aussi un ré-import statique du module HTTP. Cela
verrouille la scission de protocole de la même façon que la liste noire de la
phase 1 verrouille la scission de la façade.

## Tests

- `sdk.test.ts` garde sa configuration `vi.mock` inchangée : l'interception
  de vitest s'applique aux imports des mêmes packages d'exporters par les
  modules de protocole, donc les assertions existantes sur les arguments de
  constructeur sont conservées.
- L'acceptation suit la discipline de #4748 : 30 démarrages à froid
  séquentiels appariés sur l'hôte 2C4G, télémétrie activée (outfile),
  contrôle = build de la phase 1, candidat = ce changement, en rapportant
  les P50/P95 de channel.initialize et de process→première session.

## Alternatives rejetées

- **Modules par exporter (par signal)** : trois modules de plus pour aucun
  gain mesurable — les trois signaux d'un même protocole sont toujours
  configurés ensemble.
- **Déplacer la validation des URL dans le module HTTP** : retarderait les
  avertissements `diag` pour les URL invalides derrière un chargement de
  module et changerait le chemin sans URL valide de « aucun import du tout »
  à « import puis no-op ».
