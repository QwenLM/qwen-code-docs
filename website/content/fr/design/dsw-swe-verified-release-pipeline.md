# Pipeline de release DSW SWE-bench Verified

Ce pipeline est une implémentation isolée de :

`GitHub Release -> runner DSW auto-hébergé -> soumission d'une exécution courte -> Coordinator persistant + 10 Executors -> Publisher -> résultat de la Release`

Il n'utilise ni ne modifie le workflow, le service, l'état ou les marqueurs
de résultat de la PR #7584.

## Comportement en production

- Une release stable `vX.Y.0` démarre le workflow depuis le commit cible du
  tag de release. Les releases de correctif, les prereleases et les familles
  de tags sans rapport sont ignorées.
- Le tag de release est résolu vers son commit Git immuable.
- Le manifeste complet de 500 instances de SWE-bench Verified est figé avant
  le dispatch.
- Le runner auto-hébergé reçoit la tâche Actions via sa connexion GitHub
  sortante. Le script de dispatch à usage unique fige le manifeste et
  appelle `qwen-benchmark-pool submit` pour créer l'exécution et les tâches
  initiales.
- L'Action enregistre le `run_id` du pool et se termine sans attendre le
  benchmark.
- Un Coordinator persistant et dix Executors persistants traitent
  l'exécution. Chaque Executor revendique atomiquement une tâche et exécute
  un essai Harbor/Docker à la fois.
- Les répertoires d'essai live de Harbor restent sur le NVMe local. Les
  artefacts de tentative terminée sont copiés vers OSS sans dépendre des
  opérations de permissions POSIX d'OSS.
- Les Executors envoient un heartbeat de leurs baux et soumettent
  atomiquement les résultats. Les erreurs d'infrastructures retentables
  reçoivent jusqu'à quatre tentatives avec un backoff de 60, 120 et 240
  secondes.
- Le Coordinator récupère les baux expirés, réconcilie les compteurs
  d'exécution et applique les portes de complétion et de publication du
  manifeste. Les échecs terminaux isolés n'annulent pas les tâches
  restantes.
- Un publisher DSW persistant surveille les exécutions terminales et met à
  jour activement la release déclencheuse avec le JSON de résultat public et
  une archive de trajectoire par cas.
- Un score n'est écrit qu'après que toutes les 500 instances ont atteint un
  état terminal unique, qu'aucune tâche n'est annulée et que
  `EXECUTION_ERROR + INFRA_FAILED < 10`. Le score est
  `RESOLVED / (RESOLVED + UNRESOLVED)`, en utilisant uniquement les
  résultats de grader valides comme dénominateur.
- Dix erreurs terminales ou plus, une tâche annulée, un résultat manquant ou
  une trajectoire manquante pour un cas pouvant être scoré rendent
  l'exécution `QUARANTINED` ; le statut et les comptes sont écrits sans
  score.

## Frontières d'isolation

- Label du runner : `qwen-benchmark-dsw`
- Workflow : `.github/workflows/dsw-swe-verified-release.yml`
- Suite : `dsw_release_swe_verified_v1`
- Base de données PostgreSQL : `qwen_benchmark_dsw_release_v1`
- Runtime : `/mnt/workspace/qwen-benchmark-dsw-release-v1`
- Identifiant du modèle :
  `/mnt/workspace/qwen-benchmark-dsw-release-v1/config/model.key`
  (`root:github-runner`, mode `0640`)
- OSS : `/mnt/data/qwen-benchmark/dsw-release-v1`
- Marqueurs de release : `qwen-code-dsw-swe-verified`

Les couches d'image Docker peuvent utiliser le cache de l'hôte DSW, mais
l'état et les artefacts d'expérience ne partagent ni chemins ni tables avec
un autre pipeline de benchmark.

## Validation de branche

Utilisez `workflow_dispatch` depuis cette branche et ciblez une prerelease
isolée. Les exécutions automatiques `release.published` sont
intentionnellement limitées aux releases stables `vX.Y.0`.

Pour une prerelease de test dispatchée manuellement, une seule ligne de
corps comme
`Benchmark-Qwen-Ref: v0.20.0-nightly.20260722.b98306b7e` sélectionne une
version npm Qwen publiée existante tout en gardant le résultat sur la
release POC isolée. Ce remplacement n'est accepté que pour les prereleases.
Une release normale évalue toujours son propre tag.

`workflow_dispatch` reste disponible pour les diagnostics et les
réexécutions explicites. La validation manuelle utilise par défaut une seule
instance pour borner le temps et le coût du modèle ; les exécutions à 5 et
500 instances ne transmettent pas l'`instance_id` de cas unique. Les deux
déclencheurs sont asynchrones : Actions enregistre un accusé de réception du
dispatch mais ne reste pas en vie pendant la durée du benchmark.

## Frontière des composants

- Runner auto-hébergé GitHub : récepteur de tâches GitHub de longue durée.
- Dispatch / soumission au pool : créateur à usage unique de l'exécution et
  des tâches.
- PostgreSQL : magasin d'état persistant partagé, pas le planificateur.
- Coordinator : récupération des baux expirés, réconciliation des
  exécutions et porte de complétion.
- Executors : revendication de tâches, exécution de Harbor/Qwen Code/grader,
  heartbeat et soumission des résultats.
- Publisher : validation des exécutions terminales, génération du bundle de
  trajectoire et de résultat public, et réécriture active de la release
  GitHub.

L'implémentation DSW est maintenue séparément dans le dépôt interne
`qwen-code-benchmark-dsw`. Cette PR contient uniquement le déclencheur
GitHub, le manifeste, l'adaptateur de dispatch et le contrat de design
public.

## Validation de la suite complète

La validation isolée en prerelease s'est terminée le 2026-07-25 :

- Release de test :
  `dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3`
- Exécution GitHub Actions : `30079405895`
- Exécution du pool : `pool-31a24bc8acca49d2`
- Dataset : `swe-bench/swe-bench-verified@2`, 500 instances figées
- Exécution : 10 Executors persistants, au plus deux tentatives par instance
- Qwen Code : `v0.20.0-nightly.20260722.b98306b7e`
- Modèle : `qwen3.7-max`
- Temps réel : environ 12 heures 27 minutes
- Résultats : 332 `RESOLVED`, 107 `UNRESOLVED`, 56 `EXECUTION_ERROR`,
  5 `INFRA_FAILED`
- Couverture de grader valide : 439/500 (87,8 %)
- Taux de résolution diagnostique parmi les résultats de grader valides :
  332/439 (75,6 %)
- Statut de l'exécution : `QUARANTINED` ; aucun score officiel n'a été
  publié
- JSON public : 500 enregistrements et 500 IDs d'instance uniques

Preuves :

- https://github.com/QwenLM/qwen-code/releases/tag/dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3
- https://github.com/QwenLM/qwen-code/actions/runs/30079405895
- https://github.com/QwenLM/qwen-code/releases/download/dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3/swe-bench-verified-dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3.json

La chaîne complète a été validée, y compris le dispatch asynchrone,
l'exécution par pool de tâches, la quarantaine stricte et la réécriture par
le Publisher. L'exécution n'est pas un score officiel du modèle : 61
instances n'avaient pas de résultats de grader valides, et un pool
d'Executors en cours d'exécution a conservé un ancien classifieur d'erreurs
après une mise à jour à chaud du code source. Une réexécution complète
propre nécessite un commit/digest de worker épinglé et des Executors
redémarrés avec vérification de version.
