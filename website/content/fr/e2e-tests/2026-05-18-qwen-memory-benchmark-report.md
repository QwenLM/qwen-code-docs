# Rapport de Benchmark Mémoire de l'Exécution de Qwen Code

Date: 2026-05-18

## Résumé

Ce rapport enregistre les benchmarks mémoire locaux pour le comportement d'exécution de Qwen Code.
Il compare Qwen Code entre différents modèles et compare Qwen Code avec Claude Code sur les mêmes formes de tâches lorsque des endpoints de modèles équivalents étaient disponibles.

Le résultat principal est cohérent sur la dernière matrice (exécution unique par cellule, non répétée statistiquement) :

- Pic RSS de l'arbre de processus Qwen Code : environ `852-1062 Mio` (`0,83-1,04 Gio`).
- Pic RSS de l'arbre de processus Claude Code : environ `279-366 Mio` (`0,27-0,36 Gio`).
- Qwen Code était environ `2,3x-3,6x` plus élevé dans les benchmarks de tâches CLI non interactives testés.

Remarque : le RSS de l'arbre de processus inclut les processus enfants MCP (environ 350 Mio de surcharge côté Qwen). Cela gonfle les nombres absolus, mais la comparaison relative reste informative puisque les deux CLI ont été mesurées de la même manière.

La différence s'est reproduite dans de petites tâches de relecture de PR, de navigation dans le code et de diff synthétiques. Il est donc peu probable qu'elle s'explique uniquement par une grande PR ou par un fournisseur de modèle.

Ce rapport vise à rendre visible l'investigation actuelle des performances : ce qui a été mesuré, quelle conclusion est déjà étayée, ce qui reste inconnu et quels diagnostics devraient être ajoutés ensuite.

## Environnement de Test

| Élément                                     | Valeur                                       |
| -------------------------------------------- | -------------------------------------------- |
| Date                                         | 2026-05-18                                   |
| Plateforme                                   | Machine de développement locale macOS         |
| Version de Qwen Code                         | `0.15.11`                                    |
| Binaire de Qwen Code                         | Binaire `qwen` résolu via PATH                |
| Version de Claude Code utilisée dans la dernière matrice | `2.1.129`                                  |
| Binaire de Claude Code utilisé dans la dernière matrice | Binaire `claude` résolu via PATH              |
| Version de Node.js                            | v22.x (installation système par défaut)       |
| Méthode d'échantillonnage                    | Échantillonnage externe `ps` RSS une fois par seconde |
| Métrique principale                          | Pic RSS de l'arbre de processus               |

Le RSS de l'arbre de processus est utilisé comme métrique principale car Qwen Code lance un wrapper racine et un worker Node/Qwen enfant. Ne regarder que le processus racine peut sous-estimer l'empreinte mémoire perçue par les utilisateurs.

Des répertoires de configuration CLI temporaires ont été utilisés pour les exécutions de la matrice afin que les benchmarks ne dépendent pas de l'état global de la CLI.

## Artéfacts du Benchmark

Cinq rapports locaux ont été produits avant ce rapport consolidé :

1. Exécution mémoire de relecture de PR avec Qwen Code.
2. Exécution de comparaison de modèles avec Qwen Code.
3. Comparaison stricte Qwen Code vs Claude Code avec `pai/glm-5`.
4. Qwen Code vs Claude Code, deux CLI avec deux modèles.
5. Qwen Code vs Claude Code, matrice de cinq cas.

Ce rapport consolidé couvre les conclusions et les métriques principales des cinq rapports. Il n'intègre pas chaque ligne d'échantillon brute, transcription de terminal ou artefact d'exécution temporaire. Ces artéfacts bruts sont restés dans les répertoires locaux `tmp/` car ils sont des sorties d'expérimentation plutôt que des éléments stables du dépôt.

La dernière matrice est la preuve la plus solide car elle couvre plusieurs formes de tâches plutôt qu'un seul workload de relecture de PR.

## Conclusion Préliminaire

Les données actuelles sont suffisamment solides pour affirmer que Qwen Code a une empreinte mémoire d'exécution plus élevée que Claude Code dans ces benchmarks de tâches CLI non interactives locales. Elles ne sont pas encore suffisantes pour identifier une seule cause racine définitive.

L'explication principale est une différence de chemin d'exécution/d'exécutable de Qwen Code plutôt qu'une différence de fournisseur de modèle :

- l'écart se reproduit avec `pai/glm-5` et `qwen3.6-plus` ;
- l'écart se reproduit dans des petites tâches de relecture de PR et de navigation dans le code, pas seulement dans des tâches de grand diff ;
- Qwen Code envoie ou comptabilise systématiquement plus de tokens que Claude Code pour un travail similaire ;
- le plus grand composant observé de Qwen Code est le processus worker Node/Qwen enfant, ce qui pointe vers l'empreinte du processus en cours de tâche, le chargement de modules, l'assemblage du contexte, l'historique actif, la rétention des résultats d'outils, ou les chemins de sous-agent/sortie sauvegardée.

La mesure suivante la plus utile n'est donc pas une autre exécution externe basée uniquement sur le RSS. La prochaine mesure devrait diviser le RSS en tas V8, mémoire native, taille de session/historique, taille de résultat d'outil retenu, et activité des sous-agents/arbres de processus.

## Analyse Initiale des Causes

Le benchmark ne prouve pas encore une cause racine unique, mais il réduit le champ du problème probable.

| Signal                                                                                        | Ce qu'il suggère                                                                             | Ce qu'il ne prouve pas                                                                                    |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Qwen reste proche de `1 Gio` dans les petites relectures de PR et la navigation de code       | Un coût d'exécution élevé en temps de tâche non interactive est probablement impliqué        | Il n'identifie pas si l'empreinte est due au tas V8, à la mémoire native, au chargement de modules ou à l'état retenu |
| La taille du diff de 100 Kio à 5 Mio ne s'adapte pas linéairement au RSS                     | Les octets bruts du diff ne sont probablement pas le moteur principal                        | Les grandes sorties peuvent encore amplifier la mémoire dans les flux réels de relecture de PR             |
| Qwen utilise plus de tokens que Claude dans chaque cellule de la matrice                       | Qwen construit ou conserve probablement un état de prompt/contexte/résultat d'outil plus volumineux pour un travail similaire | Le nombre de tokens n'est pas équivalent à la mémoire du processus et peut être un effet plutôt que la cause |
| Les nombres d'appels d'outils sont similaires, et Claude utilise parfois plus de tours/appels d'outils avec un RSS plus faible | Une chaîne d'appels d'outils plus longue est peu probable comme explication principale à elle seule | La taille des sorties d'outils et leur rétention doivent encore être mesurées                             |
| Les exécutions précédentes de grandes PR ont montré une récupération de sortie sauvegardée et une amplification par sous-agent | La troncature des sorties d'outils et les chemins de sortie sauvegardée sont probablement des amplificateurs de workloads lourds | Ils n'expliquent pas entièrement l'empreinte des petites tâches en exécution                               |

La meilleure explication actuelle est donc :

1. **Coût d'exécution en temps de tâche en premier** : Qwen Code initialise ou conserve probablement plus d'état d'exécution pendant l'exécution de tâches CLI non interactives que Claude Code. Cela peut inclure l'exécution de l'agent, le registre d'outils, les adaptateurs de fournisseur, les services de session, ou les structures d'interface utilisateur/historique qui ne sont pas strictement nécessaires pour une courte tâche non interactive.
2. **Volume de contexte/résultat d'outil en second** : Qwen Code semble transporter un contexte plus volumineux, que ce soit côté modèle ou session, pour un travail similaire. L'écart de tokens fait de l'assemblage du contexte, de la normalisation des résultats d'outils et de la rétention de l'historique des suspects importants.
3. **Amplification des grandes sorties en troisième** : La relecture de grandes PR peut déclencher des chemins supplémentaires de sortie sauvegardée et de sous-agent. Ce n'est probablement pas la seule cause, mais cela peut aggraver la pression mémoire et de tokens dans des tâches de relecture réalistes.

La prochaine exécution de diagnostic devrait répondre à la question de savoir où se situe le `~1 Gio` :

- élevé immédiatement après le démarrage : coût de démarrage du module/exécution ;
- saute après l'exécution d'un outil : rétention des résultats d'outils ou normalisation ;
- saute pendant l'assemblage de la requête : construction du contexte ou historiques dupliqués ;
- croît après le streaming/compression : rétention des réponses ou état de compression ;
- principalement RSS en dehors du tas V8 : tampons natifs, modules chargés ou mémoire externe.

## Dernière Matrice

Le dernier benchmark a exécuté :

- 2 CLI : Qwen Code et Claude Code.
- 2 étiquettes de modèle : `pai/glm-5` et `qwen3.6-plus`.
- 5 cas :
  - petite relecture de PR : PR `#4268`, modification d'une ligne
  - navigation de code : `rg` plus `sed` sur des fichiers liés à la compression
  - diff local synthétique, environ 100 Kio
  - diff local synthétique, environ 1 Mio
  - diff local synthétique, environ 5 Mio

Les 20 exécutions se sont terminées avec un code `0` sans délai d'attente.

## Résultats de la Matrice

| Cas                    | Modèle          | Pic arbre Qwen | Pic arbre Claude | Qwen / Claude |
| ---------------------- | --------------- | -------------: | ---------------: | ------------: |
| petite PR `#4268`      | `pai/glm-5`     |     1032,7 Mio |        357,8 Mio |         2,89x |
| petite PR `#4268`      | `qwen3.6-plus`  |      852,2 Mio |        365,5 Mio |         2,33x |
| navigation de code     | `pai/glm-5`     |      993,1 Mio |        359,6 Mio |         2,76x |
| navigation de code     | `qwen3.6-plus`  |      996,9 Mio |        349,0 Mio |         2,86x |
| diff 100 Kio           | `pai/glm-5`     |     1012,1 Mio |        350,8 Mio |         2,89x |
| diff 100 Kio           | `qwen3.6-plus`  |     1001,1 Mio |        336,2 Mio |         2,98x |
| diff 1 Mio             | `pai/glm-5`     |     1008,3 Mio |        278,8 Mio |         3,62x |
| diff 1 Mio             | `qwen3.6-plus`  |     1003,3 Mio |        340,5 Mio |         2,95x |
| diff 5 Mio             | `pai/glm-5`     |      858,8 Mio |        323,2 Mio |         2,66x |
| diff 5 Mio             | `qwen3.6-plus`  |     1062,0 Mio |        331,2 Mio |         3,21x |

Moyenne du pic RSS de l'arbre de processus par cas :

| Cas                    | Moy. pic arbre Qwen | Moy. pic arbre Claude |
| ---------------------- | -----------------: | -------------------: |
| petite PR `#4268`      |          942,5 Mio |            361,6 Mio |
| navigation de code     |          995,0 Mio |            354,3 Mio |
| diff 100 Kio           |         1006,6 Mio |            343,5 Mio |
| diff 1 Mio             |         1005,8 Mio |            309,6 Mio |
| diff 5 Mio             |          960,4 Mio |            327,2 Mio |

## Signaux d'Exécution et de Tokens

La même matrice a également montré que Qwen Code utilise plus de tokens côté modèle dans chaque cas testé.

Exemples choisis :

| Cas               | Modèle          | CLI    | Durée | Tours | Total tokens | Appels d'outils |
| ----------------- | --------------- | ------ | ----: | ----: | -----------: | --------------: |
| petite PR         | `pai/glm-5`     | Qwen   |  25,2s |     2 |       32 567 |               3 |
| petite PR         | `pai/glm-5`     | Claude |  21,1s |     4 |        7 899 |               3 |
| navigation de code | `qwen3.6-plus` | Qwen   |  25,2s |     2 |       38 151 |               3 |
| navigation de code | `qwen3.6-plus` | Claude |  46,9s |     6 |       25 861 |               5 |
| diff 100 Kio      | `qwen3.6-plus` | Qwen   |  16,5s |     3 |       57 185 |               2 |
| diff 100 Kio      | `qwen3.6-plus` | Claude |  17,2s |     3 |        6 377 |               2 |
| diff 5 Mio        | `pai/glm-5`    | Qwen   |  23,2s |     2 |       38 574 |               2 |
| diff 5 Mio        | `pai/glm-5`    | Claude |   9,8s |     3 |        5 285 |               2 |

Cet écart de tokens ne prouve pas que le volume de tokens est la cause racine mémoire, mais il suggère que l'assemblage du contexte, la rétention des résultats d'outils ou la normalisation des réponses devraient être mesurés en parallèle du RSS et des statistiques du tas V8.

## Analyse de l'Utilisation des Tokens

L'écart de tokens est l'un des indices les plus forts, mais il nécessite des métriques de requête internes avant de pouvoir être traité comme une cause racine.

Ce que les données soutiennent aujourd'hui :

- Qwen Code a utilisé plus de tokens totaux que Claude Code dans chaque cellule de la matrice.
- L'écart apparaît même lorsque les nombres d'appels d'outils sont similaires.
- Claude a parfois utilisé plus de tours ou d'appels d'outils tout en utilisant moins de mémoire.

Ce que cela suggère :

- Le delta de tokens ne provient probablement pas uniquement d'une chaîne d'appels d'outils plus longue.
- Qwen peut transporter un état de prompt/contexte statique plus volumineux, des schémas d'outils plus grands, des résultats d'outils sérialisés plus volumineux, ou plus de contenu de conversation/session retenu.
- Les flux à grande sortie peuvent ajouter une couche supplémentaire via la troncature, la récupération de sortie sauvegardée, ou les chemins de sous-agent.

Ce qui manque encore :

- le détail des tokens d'entrée par requête ;
- la taille du prompt système et des schémas d'outils ;
- la taille des messages retenus et des résultats d'outils avant chaque requête modèle ;
- la question de savoir si les grandes sorties sont conservées à plusieurs endroits, comme l'historique du modèle, l'historique de l'interface utilisateur, l'enregistrement de session ou le stockage des sorties sauvegardées.

Ces métriques manquantes expliquent pourquoi la prochaine étape devrait ajouter des diagnostics internes plutôt que de simplement répéter le benchmark RSS externe.

## Signal Antérieur de Grande Relecture de PR

Un benchmark strict de relecture de PR antérieur utilisant la PR `#4186` a montré la même forme générale :

| Modèle          | CLI         | Pic RSS de l'arbre de processus |
| -------------- | ----------- | ------------------------------: |
| `pai/glm-5`    | Qwen Code   |                   1000,7 Mio    |
| `pai/glm-5`    | Claude Code |                    349,0 Mio    |
| `qwen3.6-plus` | Qwen Code   |                   1095,8 Mio    |
| `qwen3.6-plus` | Claude Code |                    341,1 Mio    |

Cette exécution antérieure n'était pas suffisante en elle-même car une grande PR peut déclencher des chemins inhabituels de sortie d'outil et de sortie sauvegardée. La matrice de cinq cas récents rend la conclusion plus solide car les petites tâches de relecture de PR et de navigation dans le code reproduisent également l'écart.

## Hypothèse de Travail

Les preuves actuelles soutiennent ces hypothèses, par ordre de priorité :

1. Qwen Code a une empreinte de processus en temps de tâche non interactive plus élevée que Claude Code. Le worker Node enfant de Qwen était typiquement le plus grand processus dans l'échantillonnage local, souvent autour de `0,7-0,8 Gio`.
2. Le choix du modèle n'est pas l'explication principale. `pai/glm-5` et `qwen3.6-plus` ont tous deux montré le même écart général Qwen vs Claude.
3. La grande taille de diff seule n'est pas l'explication principale. La taille de diff synthétique n'a pas augmenté linéairement de 100 Kio à 5 Mio, probablement parce que la troncature des sorties d'outils limite la quantité de sortie qui atteint le modèle.
4. La gestion du contexte/des résultats d'outils reste un contributeur probable. Qwen Code a utilisé plus de tokens que Claude Code dans chaque cellule de la matrice, et les exécutions précédentes de grandes PR ont montré des chemins de récupération de sortie sauvegardée et d'amplification par sous-agent.
5. La prochaine couche de diagnostic devrait séparer le tas V8, le RSS natif, le coût de démarrage du module/exécution, l'historique de session, l'historique de l'interface utilisateur, la rétention des résultats d'outils et l'activité des sous-agents. Le RSS externe seul ne peut pas distinguer ces causes.

## Mises en Garde

- Ce sont des exécutions uniques par cellule de matrice, non des échantillons statistiques répétés.
- Le RSS est le RSS externe du processus. Il ne peut pas distinguer le tas V8, les tampons natifs, le chargement de modules, la sortie d'outil retenue, l'état de l'interface utilisateur ou l'historique de session.
- Claude Code et Qwen Code utilisent des implémentations d'exécution et des adaptateurs de protocole différents, même lorsque les étiquettes de modèle sont les mêmes.
- Le benchmark a été exécuté localement sur macOS. Les serveurs Linux devraient être testés avant de tirer des conclusions spécifiques au déploiement.

## Mesures de Suivi Recommandées

La prochaine branche d'investigation locale devrait ajouter ou utiliser des diagnostics pour :

- `process.memoryUsage()` avant et après le démarrage, l'exécution d'outils, le streaming, la compression et la finalisation de session.
- Statistiques du tas V8 et espaces de tas.
- Handles et requêtes actifs.
- Nombre de messages de session et volume approximatif de caractères/tokens retenus.
- Nombre de résultats d'outils, taille totale retenue des résultats d'outils, plus grande taille de résultat d'outil, et si les grandes sorties sont retenues par l'historique de l'interface utilisateur ou l'historique du modèle.
- Nombre de sous-agents et RSS de l'arbre de processus/enfant.
- Événements de troncature des sorties d'outils et de récupération de sortie sauvegardée.

Ces mesures devraient être collectées avec la même matrice de benchmark afin que la comparaison RSS actuelle puisse être reliée à l'état interne de Qwen Code.