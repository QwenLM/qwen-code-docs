# Watcher d'extension ACP : mesure de la première session


Cette modification ignore le watcher de fichiers d'extension interactif dans les processus ACP. Le démon possède déjà son cycle de rafraîchissement des ressources. Les sessions terminal interactives continuent de construire le watcher. Ceci est la première étape de l'optimisation de la première session ; elle n'établit **pas** une première nouvelle session en dessous de 500 ms.

## Modification et provenance

Le baseline est le commit main `2985fef4e9b9393601141c16031b2ba039181158` ; le candidat mesuré est le commit watcher-only `2aadc4b127ec24074e0e5ddfd402e978a0c43f5d`. La modification de production est une garde de mode ACP supplémentaire. Les deux options `--acp` et `--experimental-acp` sont couvertes, ainsi qu'un contrôle qui construit le watcher pour le mode interactif. Aucune modification d'initialisation Core, de sélection de ressource, de prompt, d'authentification, de politique MCP ou d'implémentation de préchauffage n'est incluse.

Les deux bundles utilisent la version CLI 0.27.2. Le package TypeScript appelant est `@qwen-code/sdk` **0.1.32**. Les versions de package et les hashes d'entrée SDK ont été enregistrés avant et après chaque exécution. Les digests complets de l'arborescence des fichiers SDK baseline, candidat et compilé ont également été figés et vérifiés autour de la cohorte de mesure. Le candidat a été construit dans un worktree indépendant avec l'installation du lockfile pnpm 11.24.0 épinglé, le build complet, le typecheck et le bundle.

## Workload et limite de timing

La workload privée installée contient 31 ressources : 14 suites d'extensions et 17 Skills standalone, avec 90 Skills personnalisés, 3 944 fichiers et 81 931 741 octets. Chaque échantillon matérialise l'inventaire de ressources complet et identique sur un système de fichiers local sensible à la casse. Les noms de ressources, fichiers sources, contenu métier, manifests, chemins locaux, identifiants et logs bruts restent privés. Seuls les totaux agrégés et les timings sont publiés ici.

Le profil préserve les hooks et définit la allowlist MCP sur une liste vide. Il n'envoie aucun prompt, aucune requête modèle ni appel d'outil métier et ne se connecte pas aux serveurs MCP externes configurés. L'état d'activation natif installé est initialisé pendant la préparation des fixtures hors timing. Cela représente un ensemble de ressources **déjà installées et activées**, avec un processus frais et un état de session frais ; il ne prétend pas que tous les caches dérivés des ressources sont vides. La création des fixtures, la copie de fichiers, l'initialisation de l'activation native, la construction des bundles et l'import de module SDK se terminent avant qu'une quelconque horloge ne démarre.

Chaque échantillon dispose d'un HOME frais, d'un répertoire d'exécution, d'un TMPDIR, d'une racine de session persistée et d'un répertoire de cache de compilation Node initialement vide. Le démon est lancé via son véritable point d'entrée HTTP-bridge intégré avec `preheatBridge: false`. Le driver attend `runtimeReady`, puis vérifie zéro session métier et aucun canal ACP live avant son premier appel SDK. Il n'y a aucune requête HTTP de readiness ou de capacités avant cet appel. Un UUID frais demande un nouveau thread ; le résultat doit le refléter avec `attached: false`. Deux autres appels UUID frais valident le comportement des sessions suivantes.

La limite de requête ready est observée avant la construction du client SDK et la génération d'UUID de l'appelant ; les deux sont hors de l'horloge principale de création.

L'horloge principale englobe le `await client.createOrAttachSession(...)` complet : découverte des capacités, le POST de session, l'analyse JSON de réponse et la validation d'identité SDK. La première requête HTTP est `GET /capabilities` ; sa durée seule n'est **pas** une mesure de nouvelle session. Les enregistrements de requêtes conservent la séquence réelle pour les trois appels ; les appels ultérieurs ne doivent pas être supposés omettre les vérifications de capacités.

Le rapport expose également le POST de session, la limite de requête daemon-ready depuis le spawn du processus démon, et le spawn du démon jusqu'au premier résultat SDK terminé. Attendre le démon ne crée pas de processus ACP : chaque spawn ACP enregistré doit se produire après le début de l'appel SDK et la première requête HTTP. Le statut du démon doit signaler le préchauffage `not_scheduled`. Aucun profileur CPU, aucun flush explicite de cache de compilation, aucun cache de compilation enfant désactivé, aucune sleep artificielle ou sonde de démarrage n'apparaît dans les échantillons formels.

## Résultats formels

**Le premier create SDK complet passe de 1096,1 ms à 772,9 ms à la médiane : 323,2 ms / 29,48 % de moins. Le candidat reste au-dessus de 500 ms dans chaque échantillon.**

Toutes les valeurs ci-dessous sont en millisecondes, affichées en médiane (minimum–maximum), avec huit premières sessions indépendantes par condition. Les deux conditions terminent 8/8 tentatives, créant 24/24 nouvelles sessions. Aucun échantillon formel n'est exclu.

| Horloge                                 |               Baseline |         Watcher uniquement |
| --------------------------------------- | ---------------------: | -------------------------: |
| Premier create SDK complet (principal)  | 1096.1 (1078.3–1129.3) |    772.9 (758.4–824.1) |
| Premier POST de session + JSON          | 1075.7 (1058.8–1109.2) |    754.1 (739.3–798.5) |
| Spawn démon → listener observé          |    336.7 (322.5–341.5) |    329.2 (323.1–358.5) |
| Spawn démon → limite requête ready      |    630.6 (618.7–644.5) |    605.3 (591.8–621.0) |
| Spawn démon → premier résultat SDK      | 1731.0 (1709.6–1748.0) | 1384.5 (1355.5–1427.0) |
| Premier GET capacités + JSON            |       18.7 (17.7–28.1) |       18.3 (18.1–25.1) |
| Premier HTTP → spawn ACP                |       14.2 (13.9–22.3) |       14.2 (14.1–24.6) |
| Deuxième create SDK complet             |       71.1 (65.1–79.6) |       74.0 (65.2–80.0) |
| Troisième create SDK complet            |       56.9 (53.7–63.7) |       54.4 (53.4–56.6) |

Échantillons de premier create par tour apparié :

| Tour | Baseline | Watcher uniquement |
| ---- | -------: | -----------------: |
| 1    |   1098.5 |            758.4 |
| 2    |   1078.3 |            771.1 |
| 3    |   1129.3 |            807.8 |
| 4    |   1110.2 |            760.1 |
| 5    |   1082.6 |            767.9 |
| 6    |   1089.2 |            774.8 |
| 7    |   1093.7 |            789.0 |
| 8    |   1110.5 |            824.1 |

Le [résumé numérique public](./acp-extension-watcher-results.json) inclut chaque échantillon formel, les moyennes, les médianes, les plages, les digests d'arborescence de compilation/build, et les totaux de réussite/échec. Il est construit à partir d'une allowlist explicite ; il ne contient aucun inventaire de ressources privé, aucun contenu source, aucun chemin local, aucun UUID, aucun token ni aucun log brut.

Une cohorte antérieure de six tentatives a été interrompue lorsque son volume de fixtures temporaire est tombé à court d'espace (cinq échantillons terminés et un échec d'initialisation de session). Les logs d'échec contiennent `ENOSPC` lors de la création du répertoire d'exécution. Les six processus se sont fermés normalement ; la cohorte entière, y compris ses timings terminés, est exclue. Un volume indépendant plus grand et sensible à la casse ainsi que seize fixtures complètement frais ont été préparés avant de redémarrer la cohorte formelle. La preuve échouée est conservée localement ; elle n'est pas retentée silencieusement dans les résultats.

Huit tours appariés ont été exécutés en série, en alternant l'ordre A/B puis B/A. Tous les fixtures ont été préparés avant la fenêtre de mesure exclusive. Aucun build, aucune copie de fixtures, aucun autre benchmark ou test ne s'est exécuté simultanément sous cette tâche. Le cache de fichiers OS n'a pas été vidé ; ce sont des mesures de processus frais et de session fraîche sur un hôte unique, pas des mesures de disque froid. Huit échantillons par condition sont trop peu pour établir une garantie de latence de queue de production.

Hôte : macOS 26.6.2, arm64 ; Node.js v26.7.0. Cette reconstruction locale isolée utilise l'inventaire d'installation privé de préproduction ; ce n'est pas une mesure de latence de production ou de préproduction live. L'objectif de 500 ms s'applique au premier create SDK complet, et reste un travail de suivi au-delà de cette PR.

## Vérification fonctionnelle et limites

Des exécutions fonctionnelles séparées comparent les bundles baseline gelés et watcher uniquement avec le même inventaire installé complet. Elles ne font pas partie de la cohorte de timing formelle : les appels de santé et d'assistant précèdent certaines vérifications fonctionnelles.

- Les deux conditions réussissent 41/41 assertions de changement externe et 18/18 assertions d'activation/cycle de vie.
- Les huit snapshots d'assistant, les huit menus de session existante après l'assistant, les huit menus de session nouvellement créée, et les onze snapshots de cycle de vie correspondent tous après correspondance de chemin de fixture et d'UUID.
- Les lectures ordinaires préservent les différences de propagation observées : les enveloppes complètes de workspace-Skill correspondent dans 29/32 échantillons, le contenu Skill dans 31/32, et les listes de commandes de session existante dans 31/32. Un remplacement atomique apparaît plus tôt dans le candidat à une observation ; la recréation de fichier apparaît brièvement plus tôt dans la baseline. Les échantillons ultérieurs ou l'assistant normal convergent. Les éditions/restaurations de Skill d'extension restent obsolètes dans les deux conditions pendant la fenêtre d'observation de trois secondes et deviennent correctes après l'assistant.
- Les deux côtés émettent huit événements SSE publics avec la même séquence type/phase. Les sept premières charges utiles correspondantes matchent ; la dernière charge utile de rechargement rafraîchit les neuf mêmes sessions avec un ordre de complétion différent. L'ordre de tableau original est conservé lors de la vérification d'égalité.
- Les réponses de nouvelle session diffèrent naturellement en UUID, heure de création et identité client. Les autres champs de réponse correspondent ; la création réelle est indépendamment attestée par l'écho d'UUID et `attached: false`.

Seules les racines de fixture et de bundle, les identifiants de workspace dérivés de ces racines, et la correspondance d'UUID sont normalisés. Pour la comparaison métier de workspace-Skill rapportée séparément, l'horodatage d'observation et l'âge sont exclus ; les enveloppes brutes restent intactes. L'obsolescence du cache, les drapeaux de rafraîchissement, l'état d'activation, la génération, tous les champs Skill/commande, et l'ordre de tableau original ne sont pas effacés pour fabriquer l'égalité. Ces observations ne prouvent pas une latence de propagation identique ni des lectures ordinaires identiques au octet près.

Chaque groupe fonctionnel reçoit un accusé de réception de fermeture normal et se termine avec le code zéro, aucun signal, et aucun fallback forcé. Une observation OS à portée finale ne trouve aucun processus de benchmark correspondant. Les échantillons de timing formels appliquent séparément leur propre accusé de réception de fermeture normal, leur statut de sortie zéro, l'absence de fallback forcé, et la disparition de chaque PID enfant ACP enregistré.

La suite de tests unitaires CLI ciblée réussit **129/129**, avec build complet, typecheck, bundle, ESLint des fichiers modifiés, et vérifications Prettier réussis. La construction de watcher interactif est vérifiée par un contrôle unitaire ; une exécution de bout en bout d'interface terminal interactive, Windows, Linux, l'exécution de modèle, les hooks s'exécutant sur des prompts, et le comportement MCP externe sont hors de cette validation.

## Reproduire avec des ressources synthétiques publiques

Le générateur public crée des ressources génériques sans lire ni exporter l'installation privée. Il utilise 14 suites, 17 Skills standalone, et 90 manifests de Skill, mais ses octets, formes de répertoire, placement de skill standalone, définitions de hook, et préparation d'activation diffèrent. Ses timings peuvent reproduire la procédure et exposer le comportement de mise à l'échelle ; ils ne peuvent pas reproduire ni remplacer les chiffres de la workload privée ci-dessus.

Construisez une baseline gelée et un candidat gelé à partir de leurs commits respectifs en utilisant `corepack pnpm install --frozen-lockfile`, `npm run build`, et `npm run bundle`. La reproduction publique a été vérifiée avec Node.js v26.7.0. Gardez le build SDK fixe, arrêtez les builds et la copie de ressources avant la mesure, et alternez les deux bundles en série. Depuis ce checkout, exécutez un échantillon par répertoire de sortie frais :

```sh
node scripts/benchmarks/acp-first-session/fixture.mjs /tmp/acp-synthetic-a /absolute/frozen-baseline/dist
node scripts/benchmarks/acp-first-session/fixture.mjs /tmp/acp-synthetic-b /absolute/frozen-candidate/dist

node scripts/benchmarks/acp-first-session/run.mjs /tmp/acp-synthetic-a/fixture.json
node scripts/benchmarks/acp-first-session/run.mjs /tmp/acp-synthetic-b/fixture.json
```

Préparez tous les fixtures frais avant la cohorte de mesure. Un smoke synthétique frais termine les trois créations et les vérifications de non-préchauffage, d'identité, de fermeture, de sortie enfant, et de hash d'entrée enregistrée. Il valide la procédure et ne contribue par aucun échantillon aux résultats privés. Chaque exécution affiche un résumé numérique/booléen sans chemin et conserve les preuves locales détaillées à l'emplacement de sortie demandé. Les ressources synthétiques ne contiennent aucun hook SessionStart ; aucun prompt n'est envoyé, donc les hooks UserPromptSubmit rédigés ne s'exécutent pas. Utilisez au moins huit paires entrelacées, conservez les échecs, inspectez chaque assertion de préchauffage/session/spawn/fermeture, et signalez toutes les horloges. Ne commitez pas les arborescences de fixtures générées localement ni les résultats bruts.

Si un PID ACP enregistré existe toujours après l'arrêt, le runner public marque le résultat comme échoué et enregistre une erreur de nettoyage pour inspection manuelle. La réutilisation de PID l'empêche de prouver l'identité du processus, donc la terminaison automatique est limitée à son propre handle de processus wrapper.

Le travail restant pour passer sous les 500 ms doit réduire l'initialisation effectuée après le premier appel SDK, avec la même limite de non-préchauffage et les mêmes vérifications fonctionnelles. Il est délibérément séparé de cette modification de watcher en une ligne.