# Latence de première sortie du démon

- **Suivi** : #7757
- **Suivi du prompt immédiat** : #7982
- **Contexte** : #7264
- **Périmètre** : latence observable par le client démon/ACP
- **Statut** : Mesure et attribution du prompt immédiat

## Décision et périmètre

La première PR est uniquement de la mesure : un benchmark opt-in, des helpers purs de classification/statistiques, des tests et des artefacts versionnés. Elle ne modifie pas le comportement de démarrage en production.

Un prototype distinct de préparation du Provider n'est autorisé que si le baseline à bundle unique passe sa porte. Publier ce prototype exige ensuite que des bundles de contrôle et candidat distincts passent toutes les portes de latence, de ressources, fonctionnelles et de nettoyage de ce document. Un résultat négatif valide termine le travail.

Le benchmark mesure du lancement du processus jusqu'à la première sortie dérivée du modèle, tout en gardant séparés la préparation locale, l'arrivée de la requête au Provider, la première sortie, le premier texte de réponse et la complétion terminale. Le `ttft_ms` de production existant reste inchangé : il mesure toujours du dispatch au Provider jusqu'au premier contenu visible et n'absorbe ni le chargement différé ni la préparation locale du prompt.

Hors périmètre : le rendu TUI/Web Shell/éditeur, le cache de prompts, la compression, le comportement de réflexion/outils du modèle, la préconnexion réseau, l'optimisation de latence avec modèle réel, les modifications de télémétrie de production, les API publiques de cycle de vie, les champs de protocole, la configuration et les feature flags.

## Contrat du dépôt et du runner

| Chemin                                                             | Responsabilité                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `integration-tests/cli/qwen-daemon-first-output-benchmark.test.ts` | Runner opt-in, faux Provider, cycle de vie de processus isolé, protocoles baseline/comparaison et écriture d'artefacts |
| `integration-tests/cli/_first-output-benchmark.ts`                 | Suivi d'événements pur, classification, percentiles, bootstrap apparié et entrées de décision           |
| `integration-tests/cli/_first-output-benchmark.test.ts`            | Tests déterministes du contrat pur                                                                       |
| `integration-tests/fake-openai-server.ts`                          | Faux Provider existant avec fermeture de connexion opt-in pour des mesures à froid/chaud non biaisées    |

Le runner est désactivé sauf si `QWEN_FIRST_OUTPUT_BENCHMARK=1`. Ses deux modes d'entrée sont mutuellement exclusifs :

- **Baseline** : `BENCHMARK_CLI_PATH`.
- **Comparaison** : `BENCHMARK_CONTROL_CLI_PATH` et `BENCHMARK_CANDIDATE_CLI_PATH` tous deux.

`BENCHMARK_POST_SESSION_DWELL_MS` est réservé à la comparaison, accepte exactement `0`, `100` ou `500`, et vaut `0` par défaut. `BENCHMARK_MEASURED_PAIRS` est également réservé à la comparaison et accepte exactement `10` ou `30` ; il vaut `10` par défaut pour le diagnostic 500 ms et `30` sinon. Un run à 500 ms exige 10 paires et les runs à 0/100 ms en exigent 30, de sorte qu'un diagnostic ne puisse pas être étiqueté à tort comme ayant valeur de décision. Les runs formels de phase 2 invoquent le runner séparément pour les trois scénarios de dwell ; les échantillons de valeurs de dwell différentes ne sont jamais fusionnés. Modes absents ou mélangés, bundles de comparaison identiques, chemins illisibles, valeurs de dwell ou de paires non prises en charge, et plans dwell/échantillons incohérents échouent en `invalid_configuration` avant tout échantillonnage.

Le dwell est ancré sur la disponibilité SSE plutôt que sur la disponibilité de la session. La connexion SSE se situe entre les deux, donc un ancrage sur `sessionReady` laisserait une connexion lente consommer toute la fenêtre et réduirait silencieusement un scénario 100 ms à un run à prompt immédiat qui signalerait néanmoins son dwell configuré. `sseReadyToPromptMs` enregistre la fenêtre d'inactivité que chaque échantillon a réellement reçue.

Les chiffres à l'échelle de la milliseconde n'ont de sens que lorsque rien d'autre ne rivalise sur l'hôte, donc le runner est exclu de la config d'intégration partagée et possède sa propre config sérielle dans `integration-tests/vitest.firstoutput.config.ts` (`fileParallelism: false`, exécution sérielle, `retry: 0`). Les tests des helpers purs continuent de tourner dans la suite partagée. Exécutez le benchmark avec :

```text
QWEN_FIRST_OUTPUT_BENCHMARK=1 QWEN_SANDBOX=false BENCHMARK_CLI_PATH=... \
  npx vitest run --config integration-tests/vitest.firstoutput.config.ts
```

Les artefacts sont écrits sous `.qwen/investigations/daemon-first-output-benchmark/`, hors du répertoire de run jetable du harnais d'intégration. Cela conserve les runs réussis, échoués et à résultat négatif après le démantèlement global sans exiger `KEEP_OUTPUT`.

## Contrat de mesure

### Une seule horloge

Tous les horodatages de latence utilisent `performance.now()` dans le harnais parent. Aucune durée ne combine les horloges du démon, de l'enfant ACP, du Provider ou murale. La valeur d'attente en file FIFO du démon est une durée autonome existante lue après la complétion du prompt isolé ; elle n'est jamais soustraite d'un horodatage parent.

| Horodatage                 | Définition observable par le client                                                  |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `processSpawnAt`           | Immédiatement avant le `spawn` du démon                                              |
| `sessionReadyAt`           | Réponse de session réussie entièrement lue et validée                                 |
| `sseReadyAt`               | Premier callback d'époque SSE observé ; l'ancre du dwell                              |
| `promptStartedAt`          | Immédiatement avant le démarrage de la requête de prompt non bloquante                |
| `promptAcceptedAt`         | Corps du `202` HTTP validé, y compris le `promptId` de premier niveau et le curseur de relecture |
| `userEchoAt`               | `user_message_chunk` relayé correspondant analysé depuis le SSE                       |
| `providerRequestArrivalAt` | Le faux Provider accepte la requête mesurée, avant son délai fixe                     |
| `providerReadyAt`          | Le délai fixe de 50 ms s'est écoulé, immédiatement avant que le flux de réponse soit disponible |
| `firstModelOutputAt`       | Premier événement SSE qualifiant pour le `promptId` de premier niveau accepté analysé |
| `firstAnswerTextAt`        | Premier événement qualifiant de texte de réponse analysé ; nullable                   |
| `terminalAt`               | `turn_complete` ou `turn_error` correspondant analysé                                 |

Les horodatages bruts produisent ces métriques exactes :

| Métrique                               | Calcul                                                |
| -------------------------------------- | ----------------------------------------------------- |
| `processToSessionReadyMs`              | `sessionReadyAt - processSpawnAt`                     |
| `sseReadyToPromptMs`                   | `promptStartedAt - sseReadyAt`, diagnostic            |
| `promptToAcceptanceMs`                 | `promptAcceptedAt - promptStartedAt`                  |
| `acceptanceToProviderRequestArrivalMs` | `providerRequestArrivalAt - promptAcceptedAt`, signé  |
| `promptToUserEchoMs`                   | `userEchoAt - promptStartedAt`                        |
| `userEchoToProviderRequestArrivalMs`   | `providerRequestArrivalAt - userEchoAt`, signé        |
| `daemonPromptQueueWaitMs`              | Durée existante d'attente en file FIFO du démon       |
| `promptToProviderRequestArrivalMs`     | `providerRequestArrivalAt - promptStartedAt`          |
| `promptToFirstModelOutputMs`           | `firstModelOutputAt - promptStartedAt`                |
| `promptToFirstAnswerTextMs`            | `firstAnswerTextAt - promptStartedAt`, nullable       |
| `providerReadyToFirstModelOutputMs`    | `firstModelOutputAt - providerReadyAt`                |
| `promptToTerminalMs`                   | `terminalAt - promptStartedAt`                        |
| `processToFirstModelOutputMs`          | `firstModelOutputAt - processSpawnAt`                 |

`promptAcceptedAt` est diagnostique, pas une origine de latence : une requête ou un événement Provider peut précéder la réception du `202` HTTP. Le démon publie l'écho utilisateur correspondant avant de transmettre le prompt ACP, mais la livraison SSE peut encore perdre la course contre l'arrivée de la requête au Provider. Par conséquent, `acceptanceToProviderRequestArrivalMs` et `userEchoToProviderRequestArrivalMs` sont tous deux des offsets signés et les valeurs négatives sont valides. Toute autre durée doit être non négative. Le compteur d'attente en file doit avancer exactement une fois par prompt isolé et conserver un `lastMs` fini non négatif ; sinon l'échantillon est invalide car la valeur ne peut pas être corrélée de façon sûre. Des horodatages requis manquants ou des valeurs non finies invalident l'échantillon. Le harnais possède le deadline de disponibilité SSE de 30 secondes ; le timeout de connexion SDK est enregistré et réglé cinq secondes plus tard afin que l'ordre des timers ne puisse pas transformer un `sse_connect_timeout` en un autre code d'échec.

Les métriques d'attribution du prompt immédiat s'arrêtent délibérément aux frontières existantes. Ensemble, elles distinguent l'acceptation client/route, l'écho utilisateur relayé avant transmission, la mise en file FIFO du démon et l'intervalle restant enfant-ACP/préparation-locale sans ajouter d'horodatage inter-processus, de champ de protocole ou de télémétrie de production. La frontière de l'écho inclut le temps de relais SSE et est approximative plutôt qu'un horodatage interne au démon. Ces métriques ne divisent pas l'intervalle restant entre le transport ACP, la préparation du prompt, la résolution du loader du Provider et la construction de la requête ; une instrumentation plus profonde exige des preuves et un design séparés.

### Corrélation du prompt et des événements

Le collecteur SSE est actif avant le prompt, ou reprend depuis le curseur qui le précède, et met en tampon un nombre fixe d'événements jusqu'à ce que le `202` fournisse le `promptId` de premier niveau accepté. L'enveloppe d'acceptation doit contenir un `promptId` non vide et un `lastEventId` entier non négatif ; un résultat synchrone historique n'est reconnu que par son `stopReason`, tandis que toute autre réponse malformée est rejetée. Un timeout d'acceptation du prompt interrompt la requête sous-jacente avant le démantèlement de l'échantillon. Le collecteur évalue ensuite les événements en tampon et live dans leur ordre d'arrivée d'origine et n'accepte qu'une correspondance exacte de l'ID de premier niveau. Les événements de prompts antérieurs, sans ID ou sans rapport sont ignorés ; en cas de débordement du tampon, le tracker verrouille l'échec et cesse la mise en tampon, de sorte que l'échantillon est invalidé et les événements excédentaires abandonnés.

Les requêtes Provider ne portent pas le `promptId` du démon. Chaque faux Provider isolé n'autorise donc qu'une seule requête mesurée attendue à la fois et correspond à sa sentinelle de prompt unique à longueur fixe. Son horodatage peut être mis en tampon avant le `202` ; une requête supplémentaire, manquante, précoce ou concurrente fait échouer l'échantillon.

Le premier événement qualifiant détermine `firstOutputAt` :

| Événement                              | Type                                      |
| -------------------------------------- | ----------------------------------------- |
| Texte non vide d'`agent_message_chunk` | `answer_text`, et frontière de première réponse |
| Texte non vide d'`agent_thought_chunk` | `thought_text`                            |
| `tool_call` initial bien formé         | `tool_call`                               |

Non vide signifie que la longueur du texte décodé est supérieure à zéro ; le texte n'est ni rogné ni réécrit. Les trames de relecture/statut, les messages discrets locaux (y compris les sorties de slash command et de notification en arrière-plan), l'écho utilisateur, les chunks de rôle ou d'usage uniquement, les diagnostics de compression, les mises à jour malformées et `tool_call_update` ne comptent pas. `turn_error` échoue toujours. Un `turn_complete` avant une sortie qualifiante échoue également. Le tracker pur autorise des tours valides commençant par une réflexion ou un outil avec une métrique de réponse nulle, tandis que le faux Provider live doit produire sa sentinelle de réponse connue.

## Faux Provider et isolation

Le faux Provider compatible OpenAI, loopback uniquement, enregistre l'arrivée de la requête, valide la requête/modèle, attend un timer configuré de 50 ms, enregistre le délai réellement écoulé et `providerReadyAt`, émet une sentinelle de réponse en streaming unique, et se termine normalement. Les réponses du benchmark utilisent explicitement `Connection: close`, de sorte que le tour chaud ne puisse pas bénéficier d'une connexion TCP ouverte par le tour froid ; la préconnexion réseau reste hors de l'optimisation mesurée. Le délai sépare le travail local de pré-requête de la propagation des réponses/événements ; il ne modélise pas une distribution réelle de latence. Les tests purs couvrent les fixtures commençant par réflexion et par outil sans ajouter de non-déterminisme aux runs live.

Chaque processus de baseline et chaque bras de comparaison obtient un nouvel arbre de processus démon/ACP, workspace, home et `QWEN_HOME`, des ports éphémères de démon/Provider, un collecteur d'événements et un registre de requêtes neufs. Les échantillons s'exécutent en sériel.

Les caches de compilation de Node sont vides au début des runs formels, isolés par bundle et par mode, alimentés uniquement par les warmups exclus, puis réutilisés uniquement par ce même bundle. L'artefact enregistre chaque répertoire de cache pour la provenance, mais un run propre le supprime lors du démantèlement, donc le chemin enregistré n'est pas censé exister ensuite. Le contrôle et le candidat ne les partagent jamais. Les observations de warmup restent dans l'artefact avec `measured: false`.

L'enfant démarre depuis une allowlist d'environnement minimale. Il utilise des locale/timezone fixes, des chemins accessibles en écriture isolés, la télémétrie et les vérifications de mise à jour désactivées, une configuration de Provider factice, et les vrais identifiants et variables de proxy effacés. L'artefact n'enregistre que les valeurs non secrètes fournies délibérément.

Les comparaisons formelles utilisent des bundles de release construits depuis le même lockfile sur le même hôte Linux inactif à 2 vCPU. L'artefact enregistre les chemins résolus, les hachages SHA-256, les révisions sources quand disponibles, Node/OS/CPU/mémoire, et les métadonnées de charge. Le cache de pages du système de fichiers et le bruit de l'ordonnanceur ne peuvent pas être purgés de façon fiable, donc l'ordre AB/BA et la porte de sensibilité à l'ordre sont obligatoires.

## Phase 1 : baseline à froid/chaud à bundle unique

Exécutez 2 processus de warmup exclus, puis 50 processus mesurés. Chaque processus mesuré :

1. crée une nouvelle session `sessionScope: thread` et envoie un prompt immédiat à longueur fixe (`cold`) ;
2. attend son terminal validé ;
3. garde la première session ouverte, crée une session `sessionScope: thread` distincte sur le même processus enfant ACP ; et
4. envoie un prompt de même longueur avec une sentinelle distincte (`warm`).

Le runner enregistre le PID de l'enfant ACP après les deux tours et invalide l'échantillon sauf si exactement un enfant inchangé les a servis. Ce n'est qu'après le second tour qu'il ferme les deux sessions. La seconde session dispose donc d'un wrapper Provider différé par session neuf mais des caches ESM/runtime chauds à l'échelle du processus ACP. La paire borne le coût local unique du premier passage d'un processus dans le chemin du prompt, sans biais d'historique de conversation. La construction du Provider est une composante de ce coût ; le premier prompt paie aussi le premier accès à la route du démon, le premier aller-retour IPC ACP, l'échauffement JIT et tout import différé sans rapport. Le delta est donc une borne supérieure de ce que le préchargement du Provider pourrait récupérer, pas une estimation du chargement du Provider, et une porte passée n'établit pas que le Provider représente une part particulière de celui-ci. L'attribution est ce que les tests de comparaison appariés de la phase 2 mesurent. Les deux sessions construisent toujours leur propre Provider lors du prompt, donc le travail que le prototype pourrait déplacer dans le dwell n'est pas crédité ; la porte est prudente. Les métriques process-to de la seconde session sont diagnostiques.

Le baseline attend exactement deux requêtes Provider par processus. Les 50 paires froid/chaud doivent toutes être valides. Le froid et le chaud partagent un processus, donc leurs deltas sont appariés plutôt que des échantillons indépendants, et la porte est décidée sur la médiane appariée avec son intervalle bootstrap avec graine à 95 % :

```text
providerDelta[i] =
  cold promptToProviderRequestArrivalMs[i] -
  warm promptToProviderRequestArrivalMs[i]

providerDeltaCiLow = borne inférieure de l'IC à 95 % de median(providerDelta)
```

La phase 1 passe lorsque soit :

```text
providerDeltaCiLow >= 25 ms
```

soit :

```text
providerDeltaCiLow >= 10% * P50(cold promptToFirstModelOutputMs)
```

C'est la borne inférieure et non l'estimation ponctuelle qui doit franchir le seuil, de sorte qu'un delta qui dépasse tout juste le seuil ne puisse pas autoriser un prototype sur la force du bruit. La différence des deux P50 est toujours enregistrée pour la continuité mais ne décide plus rien. Le froid est toujours la première session, donc la paire ne peut pas être équilibrée en ordre comme une comparaison de phase 2 ; c'est une limitation connue de la construction, pas un oubli.

Sinon l'artefact est conservé et le travail en production s'arrête.

## Comparaison et statistiques

Chaque dwell de comparaison utilise 2 paires de warmup exclues suivies de 30 paires mesurées, sauf le scénario de 500 ms explicitement diagnostique, qui en utilise 10 et rapporte toujours un résultat de premier niveau non concluant. Les paires impaires exécutent le contrôle puis le candidat (AB) ; les paires paires exécutent le candidat puis le contrôle (BA). Chaque bras dispose d'un état neuf, et chaque delta enregistré est `candidate - control`, donc une latence négative est plus rapide.

Les bras échoués restent dans la sortie brute et invalident leurs paires. Ils ne sont pas remplacés. L'échantillonnage s'arrête après le premier processus invalide ou la première paire complétée. Le deadline externe de Vitest est dérivé prudemment du plus grand plan d'échantillonnage légal et de tous les timeouts fixes du cycle de vie, avec une marge d'ordonnanceur, de sorte que même les échantillons légaux proches du deadline ne puissent pas préempter l'écriture d'artefacts. Le démantèlement d'urgence possède son propre deadline fixe de hook. Aucune suppression d'outliers, aucune winsorisation, aucune sélection de sous-ensemble, aucun retry Vitest. Toute paire primaire invalide invalide le run formel.

Pour chaque métrique, rapportez les P50/P90/P99 au rang le plus proche et la moyenne de chaque bras, le delta médian apparié, les victoires/égalités, et les médianes de sous-groupe AB/BA. Les P90/P99 ne sont que descriptifs à 30 paires ; aucune conclusion P95 ou de latence de queue n'est tirée sans au moins 100 paires.

Deux définitions de la médiane coexistent délibérément et un lecteur comparant les colonnes doit s'attendre à ce qu'elles diffèrent sur un nombre pair d'échantillons. Le `p50` par bras est au rang le plus proche, donc c'est toujours une valeur observée. Le `median delta` apparié, et les médianes rééchantillonnées dans le bootstrap, font la moyenne des deux valeurs centrales sur des nombres pairs. Une ligne Markdown peut donc afficher un `p50` et un `median delta` qui ne se réconcilient pas arithmétiquement sans que l'un des deux soit faux.

L'intervalle de confiance à 95 % de la médiane appariée utilise 10 000 rééchantillonnages bootstrap avec graine, avec remise, des deltas de paires valides ; la graine et le nombre d'itérations sont stockés. Ses bornes sont les percentiles au rang le plus proche 2,5 et 97,5. La graine de chaque métrique est décalée par sa position dans la liste des métriques, donc insérer ou réordonner une métrique déplace les bornes bootstrap de toutes les métriques suivantes et rend les artefacts de part et d'autre du changement incomparables même pour des échantillons bruts identiques ; le `seed` stocké par métrique rend cela auditable. `orderSensitive` est vrai lorsque les deltas médians AB et BA ont des signes opposés et que l'une des deux médianes absolues est d'au moins 10 ms. La sensibilité à l'ordre rend le run non concluant plutôt que d'être moyennée.

Le résultat de premier niveau d'un artefact apparié ne décrit que sa métrique primaire dans ce scénario unique. Il n'évalue pas les portes inter-scénarios, de ressources, fonctionnelles ou de publication et ne peut pas à lui seul autoriser une pull request de phase 2.

## Échecs, artefacts et nettoyage

Chaque échec classifié de cycle de vie ou d'échantillon est conservé et possède un code primaire unique :

| Code                              | Déclencheur                                                        |
| --------------------------------- | ------------------------------------------------------------------ |
| `invalid_configuration`           | Mode, chemin, dwell, environnement ou identité de bundle invalide  |
| `daemon_boot_timeout`             | Aucun endpoint en écoute avant le deadline                          |
| `daemon_exited_before_listen`     | Le démon s'est terminé avant d'être prêt                            |
| `session_create_failed`           | Erreur ou réponse de session malformée                              |
| `sse_connect_timeout`             | SSE non établi avant le deadline                                    |
| `sse_stream_ended`                | SSE terminé avant le terminal correspondant                         |
| `prompt_accept_timeout`           | La requête de prompt ne s'est pas terminée avant le deadline        |
| `prompt_rejected`                 | Erreur ou réponse `202` malformée                                   |
| `legacy_prompt_response`          | L'endpoint a complété de façon synchrone au lieu de renvoyer un `promptId` |
| `event_buffer_overflow`           | Tampon fixe de pré-acceptation dépassé                              |
| `provider_request_count_mismatch` | Requête factice supplémentaire, manquante, précoce ou concurrente   |
| `unexpected_output_kind`          | Le benchmark live réponse uniquement a d'abord émis un autre type de sortie |
| `first_output_timeout`            | Aucune sortie qualifiante avant le deadline                         |
| `terminal_before_first_output`    | Terminal propre sans sortie qualifiante                             |
| `turn_error`                      | Terminal d'erreur correspondant                                     |
| `terminal_timeout`                | Aucun terminal après la sortie avant le deadline                    |
| `wrong_final_text`                | La réponse diffère de la sentinelle                                 |
| `cleanup_timeout`                 | Les ressources détenues ne se sont pas arrêtées avant le deadline   |
| `residual_process`                | Un descendant suivi du démon/ACP a survécu au nettoyage             |
| `harness_error`                   | Invariant de harnais non classifié ou échec d'E/S                   |

Le premier échec causal de cycle de vie reste primaire ; les échecs SSE/session et de nettoyage de processus sont enregistrés séparément et invalident néanmoins la paire. Les timings non finis et les timings négatifs invalides autres que les deux offsets signés sont conservés comme échec de harnais mais normalisés à `null` avant agrégation, et les runs échoués ne contribuent jamais aux calculs de percentiles ou de portes. Les timeouts fixes, les limites de requêtes et la capacité du tampon sont sérialisés. Les messages de diagnostic et les queues bornées de stdout/stderr n'affectent pas les décisions.

Chaque invocation écrit un JSON `daemon-first-output` de schéma version 2 plus un Markdown dérivé uniquement de ce JSON. Il contient l'identité du run/plateforme/bundle, la configuration expurgée, les warmups, chaque horodatage relatif brut et métrique, les types d'événements de première sortie/réponse/terminal verrouillés et les comptages de corrélation, les comptages de requêtes Provider, les échantillons et paires invalides, les échecs, les résultats de nettoyage, les résumés de statistiques/bootstrap/ordre, et les entrées de portes avec les raisons de décision explicites. Les runs de ressources de phase 2 étendent leurs preuves de validation avec des mesures RSS. Les échecs d'échantillons classifiés restent dans leurs emplacements d'échantillons fixes ; une configuration invalide ou un échec de harnais non classifié produit un artefact fatal. Les artefacts excluent les identifiants, les tokens et le contenu des prompts au-delà de la sentinelle non secrète du benchmark.

Le nettoyage interrompt toujours et attend le SSE, ferme les sessions live, capture les PID des descendants ACP/MCP, envoie `SIGTERM` au groupe de processus détenu tant que son leader est encore connu comme vivant, et n'intensifie sur le groupe que si ce même leader survit au délai de grâce fixe. Les descendants capturés et un verrou d'exhaustivité d'énumération restent attachés à la ressource active jusqu'au nettoyage d'urgence. Une fois que le leader est sorti, le nettoyage ne sonde plus jamais ni ne signale son identifiant numérique de groupe de processus, car POSIX peut le réutiliser ; il vérifie uniquement l'ensemble de descendants conservé et échoue de façon sûre si un descendant survit ou si l'énumération était incomplète. Les sockets Provider ne se ferment qu'après le démantèlement du processus, et l'état temporaire n'est supprimé qu'après vérification des deux. Le nettoyage n'utilise jamais de kill par nom de processus à large spectre. Tout processus invalide ou paire complétée arrête immédiatement l'échantillonnage tout en conservant l'échec. Si un processus ou un listener détenu ne peut pas être vérifié comme arrêté, le runner enregistre la racine temporaire différée au nettoyage d'urgence, marque un homologue non démarré si nécessaire pour préserver une paire invalide, et rend l'échec du démantèlement d'urgence visible plutôt que d'abandonner silencieusement sa ressource suivie. Le démantèlement d'urgence retente les processus et Providers suivis avant de supprimer les racines temporaires différées ou les caches de compilation.

## Phase 2 : préparation best-effort du Provider

### Comportement et frontière

Le générateur différé actuel mémoïse une promesse de loader à travers la génération, le streaming, le comptage de tokens et l'embedding. La préparation peut démarrer cette même promesse en avance ; elle ne doit pas ajouter un autre loader/Provider, faire une quelconque requête modèle/token/embedding, rafraîchir les identifiants, ni modifier la validation eager et le timing des identifiants Qwen OAuth. Un prompt immédiat doit rejoindre la même promesse.

Une promesse de préparation rejetée reste mémoïsée afin que le premier prompt observe le même échec. L'appelant détaché peut attacher un observateur de rejet uniquement pour empêcher un rejet non géré ; il ne doit pas effacer ni remplacer la promesse stockée. La capacité reste interne à Core et n'étend pas le contrat public `ContentGenerator`.

Le déclencheur le plus précoce autorisé est l'écriture réussie par l'enfant ACP d'un résultat `session/new` :

1. observer l'ID de requête reçu ;
2. observer une réponse envoyée avec le même ID et...
3. compter sur le fait que l'observation existante ne se produit qu'après la résolution de `writer.write(frame)` ; et
4. planifier un `setImmediate` sans référence qui démarre, mais n'attend pas, la préparation.

Les réponses en échec, l'authentification, `session/load`, `session/resume` et les autres RPC ne la déclenchent pas. Aucun sleep n'est utilisé pour deviner la livraison de la réponse. L'import ESM n'est pas annulable, donc une session fermée peut laisser un import déjà démarré se terminer ; il ne doit néanmoins émettre aucune requête, ne conserver aucune ressource externe et ne produire aucun rejet non géré.

Cette frontière est uniquement best-effort. Le démon effectue toujours le travail de persistance de propriété/config/source de session et sérialise la réponse HTTP externe après l'écriture de l'enfant. L'import du Provider peut entrer en concurrence sur un hôte à 2 vCPU et dégrader `processToSessionReadyMs` ; `setImmediate` ne crée aucune relation happens-before inter-processus. La non-infériorité de la session est donc bloquante. Si elle échoue, arrêtez plutôt que de régler un timer. Un signal exact de fin de réponse externe traverserait le transport HTTP, le bridge du démon et l'enfant ACP et nécessiterait un design séparé uniquement si la valeur mesurée justifie cette complexité.

### Portes de publication

Utilisez des bundles de release distincts sur l'hôte de référence :

| Scénario                      | Résultat requis                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Factice, dwell 0 ms, 30 paires | La borne supérieure de l'IC à 95 % de la médiane appariée pour `processToSessionReadyMs` et `promptToFirstModelOutputMs` est `<= +10 ms` |
| Factice, dwell 100 ms, 30 paires | La médiane appariée de `processToFirstModelOutputMs` est `<= -10 ms` et sa borne supérieure d'IC à 95 % est `< 0`      |
| Factice, dwell 500 ms, 10 paires | Borne supérieure diagnostique uniquement ; ne peut pas compenser une autre porte échouée ni justifier indépendamment un merge |

À travers les runs factices à 0 et 100 ms, les 60/60 paires doivent être valides, avec zéro requête Provider dans la fenêtre de préchargement, zéro processus résiduel, et aucune sensibilité à l'ordre.

Mesurez le RSS de l'arbre de processus entier pour 1, 4 et 16 sessions inactives après que la préparation du Provider s'est stabilisée et avant tout prompt. Les deux portes doivent passer :

- RSS P50 candidat moins contrôle en session unique `<= +10 MiB` ;
- croissance incrémentale candidat moins contrôle de 1 à 16 sessions live `<= +0.5 MiB` par session supplémentaire :

```text
((candidateRss16 - candidateRss1) -
 (controlRss16 - controlRss1)) / 15
```

Chaque sonde de session inactive crée les sessions en sériel, attend que la préparation se stabilise, et n'envoie aucun prompt avant la mesure RSS ; toute requête Provider la fait échouer. Le nombre et l'ordre des paires sont fixés dans l'artefact de validation de phase 2 avant la mesure formelle.

Ce n'est qu'après que toutes les portes factices/ressources passent qu'il faut exécuter la validité externe avec Provider réel sur le même hôte : 30 paires AB/BA à 100 ms plus un smoke immédiat à 10 paires. Les échecs fonctionnels/auth/streaming/réponse bloquent. L'incertitude réseau est rapportée mais ne peut pas outrepasser les conclusions factices locales dans un sens ou dans l'autre.

## Validation et décision

Les tests purs de phase 1 couvrent la classification réponse/réflexion/outil ; les exclusions local/replay/diagnostic ; la corrélation exacte et pré-`202` ; le débordement de tampon ; les chemins de terminal/erreur ; les métriques de réponse nullables ; les percentiles au rang le plus proche ; le bootstrap déterministe ; le signe du delta ; la conservation des paires invalides ; la sensibilité à l'ordre ; les artefacts fatals représentatifs ; et le rendu JSON vers Markdown. Un smoke opt-in de bundle de release valide le câblage du Provider, le cycle de vie, le schéma des artefacts et le nettoyage. Les benchmarks formels ne font pas partie du CI par défaut.

Un candidat de phase 2 teste en plus le timing du déclencheur et le filtrage RPC, le single-flight avec un prompt immédiat, zéro requête Provider/rafraîchissement d'identifiants, le rejet mémoïsé, l'écriture de réponse non bloquante et l'arrêt sûr. Il doit passer le build, le typecheck, les tests unitaires/intégration affectés, et les portes complètes d'artefacts.

```text
Baseline à froid/chaud de 50 processus valide et seuil atteint ?
├─ non → conserver l'artefact ; arrêter
└─ oui → prototyper séparément
         └─ non-infériorité factice à 0 ms ?
            ├─ non → conserver l'artefact ; arrêter
            └─ oui
               └─ factice 100 ms matériellement plus rapide avec IC < 0 ?
                  ├─ non → conserver l'artefact ; arrêter
                  └─ oui
                     └─ 60/60 valides + portes requêtes/nettoyage/ordre/RSS passées ?
                        ├─ non → conserver l'artefact ; arrêter
                        └─ oui
                           └─ les runs avec Provider réel passent-ils fonctionnellement ?
                              ├─ non → conserver l'artefact ; arrêter
                              └─ oui → la PR d'optimisation peut être publiée
```
