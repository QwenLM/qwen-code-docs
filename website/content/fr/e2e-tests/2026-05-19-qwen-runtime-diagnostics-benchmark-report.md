# Rapport de Benchmark Diagnostics Runtime Qwen Code

Date : 2026-05-19

## Périmètre

Cette exécution reprend les formes de benchmark Qwen Code précédentes avec le nouveau diagnostic runtime activé sur option. Elle ne teste que Qwen Code, pas Claude Code.

Matrice initiale de modèles :

- `pai/glm-5`
- `qwen3.6-plus`

Suivi complémentaire de taille PR :

- `DeepSeek/deepseek-v4-pro` via protocole compatible Anthropic

Cas :

- Revue de petite PR GitHub : PR `#4268`
- Navigation de code : recherche et lecture de code lié à la compression/compaction
- Diff local synthétique : environ 94.6 Kio
- Diff local synthétique : environ 968.5 Kio
- Diff local synthétique : environ 4.84 Mio

L'exécution a utilisé le CLI local fourni avec la branche de diagnostic, avec
`QWEN_CODE_PROFILE_RUNTIME=1` et un répertoire home CLI temporaire. Les serveurs MCP globaux et les hooks n'ont pas été chargés pour ce benchmark.

Avertissement important : ces valeurs RSS absolues sont inférieures à celles des exécutions `qwen` précédentes résolues via `PATH` car cette exécution a utilisé `node dist/cli.js` depuis la branche locale avec une configuration temporaire allégée. Considérez ce rapport comme une exécution de distribution de diagnostic interne, et non comme un remplacement direct de la comparaison RSS du CLI installé précédent.

## Vérification de cohérence entre CLI installé et bundle local

Une vérification de cohérence ultérieure a utilisé le même prompt minimal, le même modèle et le même mode non interactif avec le CLI installé et le bundle de diagnostic local. La seule variable intentionnelle était de savoir si Qwen Code chargeait un home CLI temporaire allégé ou la configuration utilisateur normale.

| CLI                 | Mode de config     | Total tokens | Pic RSS arborescence | Pic RSS racine | Pic nb processus | Diagnostics runtime |
| ------------------- | ------------------ | -----------: | -------------------: | -------------: | ---------------: | ------------------- |
| `qwen` via PATH     | config allégée     |       33 965 |            542.4 Mio |      249.9 Mio |                3 | non                 |
| `dist/cli.js` local | config allégée     |       47 281 |            455.2 Mio |      214.2 Mio |                4 | oui                 |
| `qwen` via PATH     | config normale     |       97 615 |          1 099.9 Mio |      250.1 Mio |                6 | non                 |
| `dist/cli.js` local | config normale     |       97 954 |          1 105.4 Mio |      212.7 Mio |                8 | oui                 |

Cette vérification change l'attribution : le pic visible par l'utilisateur de 1 Gio observé précédemment est reproductible avec la configuration normale, même sur le bundle de diagnostic local. Il n'est donc pas principalement expliqué par l'inclusion de la PR `#4186` dans la branche locale.

Au pic de configuration normale, l'échantillon d'arborescence de processus local était dominé par plusieurs processus Node/MCP enfants plutôt que par le seul processus racine Qwen :

| Rôle  | Forme de commande         | RSS au pic arborescence |
| ----- | ------------------------- | ----------------------: |
| enfant | Processus Node            |              252.9 Mio |
| enfant | Chrome DevTools MCP       |              219.7 Mio |
| enfant | Processus Node            |              219.2 Mio |
| racine | Processus Qwen Node       |              215.1 Mio |
| enfant | Configuration Chrome DevTools MCP |        175.2 Mio |

La PR `#4186` est présente dans la branche de diagnostic locale, mais il s'agit d'un filet de sécurité de compactage automatique sous pression du tas V8. Elle se déclenche à environ 70 % de pression du tas V8 ; dans cet environnement, la limite du tas Node est d'environ 4.1 Gio, tandis que le tas final du benchmark allégé était d'environ 99-143 Mio. Sur la base de ces chiffres, la baisse de RSS en configuration allégée n'est pas causée par `#4186` qui comprimerait activement le contexte pendant ces exécutions de benchmark.

### Vérification d'attribution de la configuration en mode Bare

Un second suivi a utilisé `qwen3.6-plus` avec la même forme de prompt de revue de PR sur le CLI installé et le bundle local. Il ne s'agit pas d'un benchmark métier de bout en bout normal. C'est une vérification d'attribution contrôlée pour la mémoire de démarrage/config uniquement.

`--bare` modifie les entrées runtime : il ignore la découverte des paramètres globaux normaux, le démarrage MCP, les hooks, le contexte implicite, les skills et autres intégrations de démarrage. Il peut donc échouer ou se comporter différemment lorsqu'un fournisseur de modèle n'est configuré que dans les paramètres globaux. Pour cette exécution, les identifiants du modèle ont été fournis uniquement via l'environnement du processus enfant car le mode bare ne charge intentionnellement pas les paramètres normaux du fournisseur. Aucune écriture n'a été faite dans la configuration globale de l'utilisateur.

Cette exécution n'a pas produit de statistiques utiles de tokens/appels d'outils : le modèle a terminé en un tour et n'a pas appelé la commande shell demandée. N'utilisez pas ces lignes comme résultats de benchmark de tâches normales et ne comparez pas leur comportement en tokens/appels d'outils avec la matrice ci-dessus. Elles ne sont utiles que pour estimer la part du RSS de l'arborescence de processus provenant de la configuration normale et des processus enfants configurés.

| CLI                 | Mode     | Temps réel | Tours | Utilisations outil | Pic RSS arborescence | Pic RSS racine | Pic nb processus |
| ------------------- | -------- | ---------: | ----: | ----------------: | -------------------: | -------------: | ---------------: |
| `qwen` via PATH     | normal   |       5.5s |     1 |                 0 |          1 021.3 Mio |      251.5 Mio |                5 |
| `qwen` via PATH     | `--bare` |       2.4s |     1 |                 0 |            525.7 Mio |      246.4 Mio |                2 |
| `dist/cli.js` local | normal   |       4.9s |     1 |                 0 |          1 046.2 Mio |      213.3 Mio |                5 |
| `dist/cli.js` local | `--bare` |       2.3s |     1 |                 0 |            454.3 Mio |      216.5 Mio |                3 |

Le résultat confirme l'hypothèse d'arborescence de processus pour l'attribution de démarrage/config. Sur cette machine, la configuration normale ajoute environ 0.50-0.59 Gio de RSS d'arborescence de processus visible par l'utilisateur par rapport à `--bare`, tandis que le RSS racine reste dans la même bande de 0.21-0.25 Gio. Au pic de configuration normale, le RSS supplémentaire provenait là encore de processus enfants Node/MCP supplémentaires, dont un processus Chrome DevTools MCP et son wrapper de configuration. `--bare` supprime ces enfants de démarrage/config et ramène les exécutions installées/locales dans la plage de 0.45-0.53 Gio de RSS d'arborescence.

### Isolation temporaire des paramètres MCP / Hooks

Parce que `--bare` modifie trop d'entrées runtime pour être traité comme un benchmark normal, un suivi a utilisé des répertoires `QWEN_HOME` temporaires avec des fichiers de paramètres générés à partir des paramètres normaux. L'exécution est restée sur le chemin de chargement normal des paramètres, mais n'a basculé que deux dimensions de configuration :

- MCP désactivé : `mcpServers` vidé et listes d'autorisation/exclusion MCP vidées.
- Hooks désactivés : `disableAllHooks` mis à vrai.

Aucun paramètre global n'a été modifié. Le cas a utilisé `qwen3.6-plus` et un prompt de démarrage minimal, donc il mesure le coût d'arborescence de processus de démarrage/config, pas la qualité de raisonnement de la tâche.

| CLI                 | Config temporaire     | Serveurs MCP | Outils | Pic RSS arborescence | Pic RSS racine | Pic nb processus |
| ------------------- | -------------------- | -----------: | -----: | -------------------: | -------------: | ---------------: |
| `qwen` via PATH     | complète             |            4 |     46 |          1 017.4 Mio |      249.8 Mio |                5 |
| `qwen` via PATH     | MCP désactivé        |            0 |     17 |            548.7 Mio |      252.4 Mio |                2 |
| `qwen` via PATH     | hooks désactivés     |            4 |     46 |          1 003.8 Mio |      246.4 Mio |                5 |
| `qwen` via PATH     | MCP + hooks désactivés |          0 |     17 |            542.5 Mio |      248.0 Mio |                2 |
| `dist/cli.js` local | complète             |            4 |     48 |            865.9 Mio |      220.4 Mio |                6 |
| `dist/cli.js` local | MCP désactivé        |            0 |     19 |            442.9 Mio |      209.6 Mio |                2 |
| `dist/cli.js` local | hooks désactivés     |            4 |     48 |            848.3 Mio |      212.6 Mio |                5 |
| `dist/cli.js` local | MCP + hooks désactivés |          0 |     19 |            447.2 Mio |      217.8 Mio |                2 |

Interprétation :

1. La désactivation de MCP est le changement dominant. Elle supprime 4 serveurs MCP, réduit le nombre d'outils annoncés d'environ 29 outils, et abaisse le RSS de l'arborescence de processus d'environ 0.42-0.47 Gio dans ce cas de démarrage/config.
2. La désactivation des hooks seuls modifie à peine le RSS dans ce cas. C'est attendu car le prompt n'a pas produit d'appels d'outils, donc les hooks `PreToolUse` / `PostToolUse` n'ont pas été exécutés.
3. Le processus racine reste autour de 0.21-0.25 Gio sur toutes les lignes. La grande différence provient à nouveau de la composition de l'arborescence de processus, pas du RSS racine de Qwen.

Deux tentatives de suivi de navigation de code avec `qwen3.6-plus` et `pai/glm-5` ont également reproduit la même répartition mémoire MCP vs sans MCP, mais aucun modèle n'a produit d'appels d'outils dans ces exécutions. Ces lignes ne sont donc pas utilisées comme preuve d'exécution de hooks. Un benchmark valide des hooks nécessite toujours une combinaison tâche/modèle qui émet de manière fiable des appels d'outils.

### Isolation par MCP

La ligne précédente montrait que MCP en groupe est le facteur mémoire dominant au démarrage/config. Un suivi a isolé chaque serveur MCP configuré tout en gardant les hooks désactivés pour toutes les lignes. Cela maintient le test sur le chemin de chargement normal des paramètres mais ne modifie que le sous-ensemble de serveurs MCP.

Noms des serveurs MCP configurés :

- `approval-bridge`
- `env-center`
- `chrome-devtools`
- `code`

Isolation en un seul passage :

| Variante                    | MCP activés                                       | Outils | Serveurs MCP | Pic RSS arborescence | Pic RSS racine | Interprétation                            |
| --------------------------- | ------------------------------------------------- | -----: | -----------: | -------------------: | -------------: | ----------------------------------------- |
| aucun                       | aucun                                             |     19 |            0 |            444.4 Mio |      211.7 Mio | ligne de base sans MCP                    |
| complet                     | tous les 4                                        |     48 |            4 |            857.3 Mio |      215.9 Mio | forme de démarrage MCP complet            |
| seulement `approval-bridge` | `approval-bridge`                                 |     19 |            1 |            455.5 Mio |      214.0 Mio | proche de la ligne de base                |
| seulement `env-center`      | `env-center`                                      |     19 |            1 |            452.3 Mio |      214.4 Mio | proche de la ligne de base                |
| seulement `chrome-devtools` | `chrome-devtools`                                 |     48 |            1 |            824.4 Mio |      209.5 Mio | forte augmentation RSS et du nombre d'outils |
| seulement `code`            | `code`                                            |     19 |            1 |            452.1 Mio |      216.6 Mio | proche de la ligne de base                |
| sans `approval-bridge`      | `env-center`, `chrome-devtools`, `code`            |     48 |            3 |            997.1 Mio |      215.4 Mio | toujours élevé ; l'exécution a montré une variance |
| sans `env-center`           | `approval-bridge`, `chrome-devtools`, `code`       |     48 |            3 |            863.8 Mio |      220.9 Mio | toujours élevé                            |
| sans `chrome-devtools`      | `approval-bridge`, `env-center`, `code`            |     19 |            3 |            463.4 Mio |      221.6 Mio | retour proche de la ligne de base         |
| sans `code`                 | `approval-bridge`, `env-center`, `chrome-devtools` |     48 |            3 |            858.1 Mio |      219.5 Mio | toujours élevé                            |

Comme le RSS de démarrage présente une certaine variance, les variantes clés ont été répétées deux fois :

| Variante                    | Échantillons | Plage RSS arborescence | RSS arborescence moyen | Résultat                            |
| --------------------------- | -----------: | ---------------------- | ---------------------: | ----------------------------------- |
| aucun                       |            2 | 443.3-451.9 Mio        |              447.6 Mio | ligne de base stable sans MCP       |
| complet                     |            2 | 856.1-922.8 Mio        |              889.5 Mio | plage haute stable avec MCP         |
| seulement `chrome-devtools` |            2 | 1 007.1-1 021.2 Mio    |            1 014.2 Mio | suffit seul à reproduire le niveau haut |
| sans `chrome-devtools`      |            2 | 461.1-461.6 Mio        |              461.4 Mio | supprime le RSS élevé               |
| seulement `approval-bridge` |            2 | 449.1-449.9 Mio        |              449.5 Mio | proche de la ligne de base          |
| seulement `env-center`      |            2 | 438.7-449.5 Mio        |              444.1 Mio | proche de la ligne de base          |
| seulement `code`            |            2 | 450.6-451.3 Mio        |              451.0 Mio | proche de la ligne de base          |

Interprétation :

1. `chrome-devtools` est le contributeur MCP dominant dans cet environnement. Il suffit à lui seul pour reproduire le RSS élevé de l'arborescence de processus.
2. La suppression de `chrome-devtools` de l'ensemble MCP complet ramène le RSS à la bande sans MCP. La suppression des autres MCP tout en gardant `chrome-devtools` ne le fait pas.
3. Le nombre d'outils annoncés suit le même motif : la ligne de base est de 19 outils, tandis que `chrome-devtools` élève le nombre d'outils à 48. Cela signifie que ce MCP est également susceptible d'augmenter la taille du schéma des outils des requêtes et la pression sur les tokens, pas seulement le RSS de l'arborescence de processus.
4. `approval-bridge`, `env-center` et `code` individuellement restent proches de la ligne de base sans MCP dans ces exécutions de démarrage/config. Ils ont émis des avertissements de démarrage dans cet environnement, donc ce résultat doit être interprété comme « aucun propriétaire de RSS de démarrage persistant observé » plutôt que comme une preuve qu'ils n'ont aucun coût dans tous les workflows.

## Résumé Runtime

| Cas                    | Modèle          | Temps réel | Tours | Total tokens | Pic RSS arborescence | Pic RSS racine | Tas final | RSS final |
| ---------------------- | --------------- | ---------: | ----: | -----------: | -------------------: | -------------: | --------: | --------: |
| petite PR `#4268`      | `pai/glm-5`     |      20.1s |     7 |      173 216 |            362.1 Mio |      359.8 Mio | 103.1 Mio | 216.5 Mio |
| navigation de code     | `pai/glm-5`     |      18.4s |     2 |       49 127 |            378.0 Mio |      376.0 Mio | 102.4 Mio | 313.4 Mio |
| diff 94.6 Kio          | `pai/glm-5`     |      16.6s |     6 |      135 716 |            367.9 Mio |      366.0 Mio |  99.1 Mio | 295.0 Mio |
| diff 968.5 Kio         | `pai/glm-5`     |      11.4s |     2 |       42 590 |            373.2 Mio |      362.5 Mio | 106.4 Mio | 345.6 Mio |
| diff 4.84 Mio          | `pai/glm-5`     |      12.0s |     4 |       95 119 |            414.2 Mio |      412.0 Mio | 123.6 Mio | 410.7 Mio |
| petite PR `#4268`      | `qwen3.6-plus`  |      35.0s |     6 |      156 556 |            358.9 Mio |      356.9 Mio | 102.6 Mio | 293.1 Mio |
| navigation de code     | `qwen3.6-plus`  |      28.9s |     4 |       99 800 |            370.3 Mio |      368.3 Mio | 105.8 Mio | 298.2 Mio |
| diff 94.6 Kio          | `qwen3.6-plus`  |      28.3s |     4 |       90 808 |            358.8 Mio |      356.9 Mio | 105.9 Mio | 307.0 Mio |
| diff 968.5 Kio         | `qwen3.6-plus`  |      30.9s |     6 |      151 782 |            366.1 Mio |      364.1 Mio | 101.0 Mio | 316.9 Mio |
| diff 4.84 Mio          | `qwen3.6-plus`  |      24.1s |     4 |       93 271 |            372.8 Mio |      366.0 Mio | 142.8 Mio | 366.0 Mio |

Moyenne par modèle :

| Modèle          | Pic RSS arborescence moyen | Pic RSS racine moyen | Tours moyen | Total tokens moyen | Taille max corps filaire moyen | Total résultat outil moyen |
| --------------- | -------------------------: | -------------------: | ----------: | -----------------: | ----------------------------: | -------------------------: |
| `pai/glm-5`     |                   379.1 Mio |            375.3 Mio |         4.2 |             99 154 |                     111.8 Kio |                  335.1 Kio |
| `qwen3.6-plus`  |                   365.4 Mio |            362.4 Mio |         4.8 |            118 443 |                     119.3 Kio |                  344.3 Kio |

Comparaison modèle sur petite PR `#4268` :

| Modèle                      | Protocole  | Temps réel | Tours | Total tokens | Pic RSS arborescence | Pic RSS racine | Taille max corps filaire |
| --------------------------- | ---------- | ---------: | ----: | -----------: | -------------------: | -------------: | -----------------------: |
| `pai/glm-5`                 | OpenAI     |      20.1s |     7 |      173 216 |            362.1 Mio |      359.8 Mio |                113.8 Kio |
| `qwen3.6-plus`              | OpenAI     |      35.0s |     6 |      156 556 |            358.9 Mio |      356.9 Mio |                134.1 Kio |
| `DeepSeek/deepseek-v4-pro`  | Anthropic  |      39.7s |     2 |       43 362 |            346.9 Mio |      344.8 Mio |                103.0 Kio |

## Diagnostics des Requêtes et Outils

| Cas                    | Modèle          | Requêtes | Taille max corps filaire | Taille max prompt système | Taille max schéma outil | Appels outil | Total résultat outil | Taille max résultat outil | Taille max réponse fonction dans requête |
| ---------------------- | --------------- | -------: | -----------------------: | ------------------------: | ----------------------: | -----------: | -------------------: | -----------------------: | --------------------------------------: |
| petite PR `#4268`      | `pai/glm-5`     |        7 |                 113.8 Kio |                  51.4 Kio |                 40.2 Kio |            9 |              4.7 Kio |                  3.9 Kio |                                15.3 Kio |
| navigation de code     | `pai/glm-5`     |        2 |                 114.6 Kio |                  51.5 Kio |                 40.2 Kio |            3 |             17.5 Kio |                  6.2 Kio |                                18.4 Kio |
| diff 94.6 Kio          | `pai/glm-5`     |        6 |                 111.2 Kio |                  39.1 Kio |                 37.2 Kio |            9 |             94.9 Kio |                 92.6 Kio |                                29.2 Kio |
| diff 968.5 Kio         | `pai/glm-5`     |        2 |                 104.8 Kio |                  39.1 Kio |                 37.2 Kio |            2 |            772.1 Kio |                771.9 Kio |                                25.6 Kio |
| diff 4.84 Mio          | `pai/glm-5`     |        4 |                 114.7 Kio |                  39.1 Kio |                 37.2 Kio |            4 |            786.3 Kio |                783.2 Kio |                                34.7 Kio |
| petite PR `#4268`      | `qwen3.6-plus`  |        6 |                 134.1 Kio |                  51.4 Kio |                 40.2 Kio |            5 |             34.6 Kio |                 15.6 Kio |                                36.6 Kio |
| navigation de code     | `qwen3.6-plus`  |        4 |                 114.9 Kio |                  51.5 Kio |                 40.2 Kio |            3 |             17.5 Kio |                  6.2 Kio |                                18.4 Kio |
| diff 94.6 Kio          | `qwen3.6-plus`  |        4 |                 112.8 Kio |                  39.1 Kio |                 37.2 Kio |            3 |             92.9 Kio |                 92.6 Kio |                                33.0 Kio |
| diff 968.5 Kio         | `qwen3.6-plus`  |        6 |                 113.1 Kio |                  39.1 Kio |                 37.2 Kio |            5 |            778.0 Kio |                771.9 Kio |                                32.1 Kio |
| diff 4.84 Mio          | `qwen3.6-plus`  |        4 |                 121.5 Kio |                  39.1 Kio |                 37.2 Kio |            4 |            798.5 Kio |                783.2 Kio |                                41.3 Kio |

## Observations

1. Le RSS de l'arborescence de processus est presque identique au RSS racine dans cette exécution avec le bundle local. L'écart racine/arborescence est généralement inférieur à 10 Mio. Cela signifie que ces exécutions n'ont pas montré de propriétaire de mémoire persistant parmi les processus enfants. Le processus dominant est le processus Node principal.
2. Le pic de l'exécution avec le bundle local est d'environ 0.36-0.41 Gio, et non de 0.83-1.04 Gio comme précédemment, car la matrice utilisait une configuration temporaire allégée. Une vérification de cohérence ultérieure avec configuration normale a reproduit environ 1.1 Gio de RSS arborescence à la fois pour `qwen` via PATH et `dist/cli.js` local, la mémoire supplémentaire provenant des processus enfants MCP/Node dans l'arborescence.
3. Le tas V8 est beaucoup plus petit que le RSS. Le tas final est d'environ 99-143 Mio tandis que le RSS final est d'environ 216-411 Mio. L'empreinte restante provient probablement de modules chargés, d'allocations natives, de tampons externes, ou de surcharge runtime en dehors du tas JS actif.
4. Le surcoût statique des requêtes est important et répété. Le prompt système fait environ 39-51 Kio par requête, et le schéma d'outil environ 37-40 Kio par requête. Cela explique pourquoi même de petites tâches peuvent produire des nombres de tokens cumulés élevés lorsque le modèle prend plusieurs tours.
5. La sortie de grands diffs est limitée avant d'atteindre la requête du modèle. Les cas de diff de 968 Kio et 4.84 Mio ont produit environ 772-799 Kio de résultat d'outil capturé, mais la plus grande réponse de fonction visible par le modèle dans une requête est restée autour de 25-41 Kio, et la taille maximale du corps filaire autour de 105-122 Kio. Cela indique que la troncature / gestion des sorties sauvegardées fonctionne sur le chemin visible par le modèle.
6. La mémoire augmente encore dans les cas de grande sortie même si le corps filaire reste borné. Par exemple, l'exécution GLM de 4.84 Mio a atteint 414.2 Mio de RSS arborescence et 410.7 Mio de RSS final, et l'exécution qwen3.6-plus de 4.84 Mio s'est terminée avec 142.8 Mio de tas. Cela suggère qu'une grande sortie d'outil peut encore affecter la capture locale, la normalisation ou l'état runtime conservé même lorsque la charge utile finale de la requête est limitée.
7. Le choix du modèle a modifié le nombre de tours et le total de tokens plus que le RSS dans cette exécution. `qwen3.6-plus` a eu en moyenne plus de tokens et de tours que `pai/glm-5`, mais son pic RSS arborescence moyen était légèrement inférieur. Cela soutient la conclusion précédente selon laquelle le choix du modèle n'est pas l'explication principale de la mémoire du processus.
## Inférence de travail mise à jour

Les nouveaux diagnostics rendent l'hypothèse précédente plus précise :

- Le pic de 1 Gio visible par l'utilisateur avec l'interface interactive installée est désormais reproductible avec la configuration normale sur le bundle de diagnostic local. L'exécution allégée doit être utilisée pour l'attribution interne du runtime Qwen ; l'exécution avec configuration normale doit être utilisée pour l'attribution de l'arbre de processus visible par l'utilisateur.
- La plus grande différence observée entre la configuration allégée et la configuration normale est la forme de l'arbre de processus : la configuration normale démarre des processus enfants MCP/Node supplémentaires. Ces enfants expliquent la majeure partie du saut absolu d'environ 0,35-0,55 Gio à environ 1,1 Gio dans le test de validation avec une invite minimale.
- Le suivi avec `--bare` confirme la même tendance sur `qwen3.6-plus` : la configuration normale coûte environ 0,50-0,59 Gio de RSS d'arbre de processus de plus que le mode nu pour la même forme d'invite, tandis que le RSS racine ne change que légèrement.
- L'isolation des paramètres temporaires est un meilleur test d'attribution que `--bare` : désactiver MCP seul réduit le RSS de l'arbre de processus d'environ 0,42-0,47 Gio tout en conservant le chemin normal de chargement des paramètres. Désactiver les hooks seul n'affiche pas de changement significatif de RSS dans les cas sans appel d'outil.
- L'isolation par MCP pointe vers `chrome-devtools` comme le contributeur MCP dominant : il suffit à lui seul pour reproduire la bande haute de RSS, et le retirer ramène l'exécution près de la ligne de base sans MCP.
- Au sein du runtime Qwen local, les zones les plus suspectes ne sont plus les "octets de diff bruts envoyés au modèle". Le corps de la requête côté modèle est limité.
- Les suspects les plus forts sont le coût statique du contexte par requête, les tours de requête répétés, la taille du schéma d'outil, et la rétention/capture locale de grandes sorties d'outils avant ou en dehors de la troncature côté modèle.
- Étant donné que le RSS reste bien supérieur au heap V8, la prochaine couche de profilage devrait inclure la comptabilité des modules/démarrage, la mémoire externe, et des instantanés du heap autour de l'exécution des outils et de l'émission de la réponse finale.

## Attribution RSS à partir des diagnostics actuels

Les compteurs actuels n'identifient pas un objet retenu ou un fichier source exact, mais ils restreignent ce qui pilote ou non le RSS dans ces exécutions locales :

| Signal | Preuve actuelle | Implication RSS |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| RSS racine vs RSS de l'arbre de processus | Les pics racine et arbre sont généralement dans un écart d'environ 2-10 Mio ; la grande PR DeepSeek a le plus grand écart à environ 23,6 Mio | Aucun processus enfant persistant n'explique le RSS dans cette exécution du bundle local ; le processus Node principal domine |
| Arbre de processus avec configuration normale | Les exécutions avec configuration normale et invite minimale atteignent environ 1,1 Gio de RSS d'arbre tandis que le RSS racine reste autour de 213-250 Mio | Les pics de 1 Gio visibles par l'utilisateur peuvent être dominés par les processus enfants MCP/Node plutôt que par le seul RSS racine de Qwen |
| Comparaison avec `--bare` | Les exécutions normales de `qwen3.6-plus` culminent autour de 1,02-1,05 Gio de RSS d'arbre ; les exécutions nues culminent autour de 0,45-0,53 Gio | Charger la configuration normale ajoute environ 0,50-0,59 Gio de RSS d'arbre de processus dans cet environnement |
| Isolation temporaire de MCP | Effacer les serveurs MCP fait chuter le RSS d'arbre au démarrage/configuration de 865-1 017 Mio à 443-549 Mio | Le démarrage MCP et les processus enfants MCP expliquent environ 0,42-0,47 Gio du RSS de l'arbre de processus dans la vérification de configuration contrôlée |
| Isolation par MCP | `chrome-devtools` seul atteint environ 1,0 Gio dans des échantillons répétés ; sans lui, l'exécution reste autour de 461 Mio | `chrome-devtools` est le contributeur dominant du RSS de l'arbre de processus MCP dans cet environnement |
| Isolation temporaire des hooks | `disableAllHooks=true` avec MCP toujours activé ne change le RSS d'arbre que d'environ 13-18 Mio dans les cas sans appel d'outil | La configuration des hooks seule n'est pas un facteur visible du RSS de démarrage ici ; l'exécution des hooks nécessite encore un benchmark avec appels d'outils |
| Heap V8 vs RSS | Le heap final est d'environ 99-143 Mio tandis que le RSS final est d'environ 216-411 Mio | Le heap JS vivant n'est pas l'empreinte totale ; les modules chargés, les allocations natives, les tampons externes ou la surcharge d'exécution sont probablement significatifs |
| Taille PR/diff vs RSS | Les PR DeepSeek petites/moyennes/grandes vont de 1 à 4 750 lignes modifiées, mais le RSS d'arbre reste dans une bande étroite de 340,7-360,0 Mio | La taille brute de la PR n'entraîne pas linéairement le RSS une fois que la sortie de l'outil est limitée |
| Taille de la sortie des outils | Les exécutions avec grand diff capturent environ 772-799 Kio de résultats d'outils et montrent un RSS/heap final plus élevé, mais le RSS n'augmente pas linéairement | La capture/normalisation des résultats d'outils contribue à la pression, en particulier dans les cas de grandes sorties, mais il est peu probable que ce soit le seul facteur de RSS |
| Taille du corps de la requête | Le corps maximal côté modèle varie d'environ 103-289 Kio tandis que le RSS reste dans la même bande | La taille de sérialisation de la requête affecte les tokens et la latence plus clairement que le pic de RSS |
| Contexte statique par requête | Le prompt système est d'environ 39-51 Kio et le schéma d'outil d'environ 37-48 Kio par requête | Les tours répétés sont un amplificateur de coût/token ; cela seul n'explique pas le RSS mais constitue une cible d'optimisation probable pour la pression des tokens |

Attribution de travail : dans le benchmark du bundle local allégé, le plancher de RSS ressemble surtout à une empreinte d'exécution/module/native en cours de tâche, avec les grandes sorties d'outils ajoutant une pression incrémentale. Dans l'exécution avec configuration normale, le pic d'arbre de 1 Gio visible par l'utilisateur est principalement une composition de l'arbre de processus : racine Qwen plus processus enfants MCP/Node. La prochaine mesure ciblée devrait séparer les diagnostics de la racine Qwen des diagnostics des serveurs MCP configurés, puis ajouter des points de contrôle de démarrage/module/mémoire externe dans le processus racine Qwen.

## Instantané d'avancement

Signaux confirmés actuels :

1. Le pic de démarrage/configuration de 1 Gio visible par l'utilisateur est reproductible avec à la fois l'interface interactive installée et le bundle de diagnostic local lorsque la configuration normale est chargée. Il n'est pas principalement expliqué par la branche de diagnostic ou la PR `#4186`.
2. Dans cet environnement, ce pic de 1 Gio est principalement une composition de l'arbre de processus : processus racine Qwen plus processus enfant de relance plus processus enfants MCP.
3. `chrome-devtools` est le contributeur MCP configuré dominant dans la configuration actuelle. Il suffit à lui seul pour reproduire la bande haute de RSS de l'arbre de processus, même lorsque l'invite n'utilise pas explicitement ce MCP.
4. La forme de relance normale sans MCP se situe toujours autour de 0,45 Gio de RSS d'arbre de processus. Un seul processus runtime Qwen sans le parent de relance est plus proche de 0,22-0,24 Gio dans la vérification d'attribution au démarrage. Cela signifie que la ligne de base de 0,45 Gio n'est pas un nombre de RSS racine monoprocessus.
5. Dans les exécutions de tâches non interactives allégées, le choix du modèle modifie les tours, les totaux de tokens, la latence et les tailles de requête plus clairement que le RSS. Le RSS est resté dans une plage relativement étroite entre `pai/glm-5`, `qwen3.6-plus` et `DeepSeek/deepseek-v4-pro`.
6. Les diagnostics actuels des tâches courtes montrent que les réponses d'outils/fonctions côté modèle sont limitées, mais la capture locale des résultats d'outils et l'état d'exécution peuvent encore augmenter le heap/RSS dans les cas de grandes sorties. Cela maintient la rétention des grandes sorties sur la voie d'investigation.

Lacunes actuelles :

1. La matrice de benchmark des tâches courtes a encore une durée de vie courte. Une exécution interactive ultérieure de révision longue a bien reproduit un échec de 41,9 min, mais il s'agit encore d'un seul échantillon et nécessite des exécutions répétées ainsi qu'une attribution du heap/des objets.
2. Les compteurs actuels suffisent pour attribuer le RSS de l'arbre de processus et la taille de la requête, mais pas pour nommer le graphe d'objets JS retenu lors de longues sessions.
3. Le RSS de démarrage/configuration et l'OOM des longues sessions doivent rester des pistes séparées. MCP et la relance expliquent une large bande de RSS inactif/démarrage ; ils n'expliquent pas à eux seuls l'OOM du heap V8 après de longues tâches.
4. La mémoire de l'interface interactive en mode TUI nécessite encore une exécution séparée du mode non interactif, car l'historique de l'interface utilisateur et la sortie statique d'Ink ne sont pas sollicités de la même manière.

## Preuves d'OOM des longues tâches issues des Issues et PRs

Les preuves des issues/PR pointent vers plusieurs formes différentes d'OOM, et non un seul mode de défaillance :

| Source | Résumé des preuves | Hypothèse à tester |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [`#4309`](https://github.com/QwenLM/qwen-code/issues/4309) | L'utilisateur signale une utilisation mémoire de 5,84 Gio / avertissement de 7,02 Gio avec le mode YOLO et le backend DeepSeek ; augmenter la mémoire Node à 8 Gio n'a pas supprimé le symptôme | Les boucles d'outils autonomes longues peuvent retenir suffisamment d'état pour que simplement augmenter la limite d'old space ne soit pas une solution définitive |
| [`#4149`](https://github.com/QwenLM/qwen-code/issues/4149) | Plusieurs rapports montrent `Ineffective mark-compacts near heap limit`, y compris des cas avec 4 Gio et des limites de heap bien plus grandes | Une grande partie du heap est un état d'application accessible, pas des déchets immédiatement collectibles |
| [`#4116`](https://github.com/QwenLM/qwen-code/issues/4116) | L'OOM s'est produit alors que l'affichage du contexte était autour de 9,5 % ; l'analyse pointe vers `structuredClone`, l'historique de l'interface utilisateur, l'arbre statique d'Ink et les grandes fenêtres de contexte | L'utilisation de tokens peut être faible alors que la pression du heap JS est élevée ; le seuil de tokens seul n'est pas une protection mémoire fiable |
| [`#4167`](https://github.com/QwenLM/qwen-code/issues/4167) | L'utilisateur dit que le plantage s'est produit lors de la compression ; l'analyse identifie la mémoire de pointe de compression comme une forme distincte | La compression peut elle-même créer un pic lorsque le heap est déjà élevé, surtout si l'historique est cloné/converti en chaîne à peu près au même moment |
| [`#2128`](https://github.com/QwenLM/qwen-code/issues/2128) | Le rapport identifie un historique d'interface utilisateur illimité, des diffs de fichiers / sorties de terminal retenus, des caches de largeur de chaîne et une sérialisation de points de contrôle | Les longues sessions de TUI interactif peuvent retenir de la mémoire en dehors de l'historique du modèle et en dehors des benchmarks non interactifs |
| [`#2562`](https://github.com/QwenLM/qwen-code/issues/2562) | Le rapport se concentre sur le clonage profond de tout l'historique par `GeminiChat.getHistory()` dans les longues sessions | Le clonage complet de l'historique peut amplifier les pics de mémoire et doit être mesuré séparément de la taille retenue en régime permanent |
| [`#4185`](https://github.com/QwenLM/qwen-code/issues/4185) | Suit la pression du heap V8 dépassant la limite avant que la compaction basée sur les tokens ne s'exécute | La garde de pression du heap est nécessaire, mais elle n'atténue que les symptômes si les données retenues restent importantes |
| [`#4184`](https://github.com/QwenLM/qwen-code/issues/4184) | Propose des diagnostics et un déchargement/aperçu pour les grands résultats d'outils retenus | La grande sortie d'outil peut être limitée pour les requêtes du modèle tout en étant retenue dans la mémoire chaude locale |
| [`#4186`](https://github.com/QwenLM/qwen-code/pull/4186) | Filet de sécurité de compaction automatique sous pression du heap fusionné et accès O(1) au dernier historique pour `nextSpeakerChecker` | Couvre une partie de la pression du heap et de l'amplification des clones, mais ne prétend pas résoudre toutes les classes d'OOM |
| [`#4127`](https://github.com/QwenLM/qwen-code/pull/4127), [`#4168`](https://github.com/QwenLM/qwen-code/pull/4168) | PRs ouvertes sur les seuils de compaction ; l'une utilise des seuils de heap fixes, l'autre redéfinit les seuils de tokens et le comportement de compression | Travail connexe utile, mais les tests de longues tâches doivent vérifier si les signaux de heap, de tokens et de compression concordent dans des exécutions réelles |
| [`#3000`](https://github.com/QwenLM/qwen-code/issues/3000), [`#4183`](https://github.com/QwenLM/qwen-code/issues/4183) | La feuille de route de diagnostic mentionne `/doctor memory`, l'instantané du heap et la chronologie de mémoire bornée | Le support d'instantané/chronologie est nécessaire pour passer de l'attribution RSS à l'attribution des objets retenus |

Interprétation initiale :

- Un MCP configuré mais non utilisé peut consommer de la mémoire car le démarrage normal se connecte aux serveurs MCP configurés et annonce leurs outils avant que la tâche n'en ait besoin. Dans la configuration mesurée, `chrome-devtools` démarre des processus MCP Node/npm supplémentaires et augmente également le nombre de schémas d'outils de 19 à 48. Cela explique une large bande de RSS de démarrage/configuration et peut également augmenter la surcharge des requêtes répétées.
- Les rapports d'OOM en session longue sont une couche différente. Les journaux GC où Mark-Compact libère très peu de mémoire suggèrent que le heap est plein d'état accessible. Les candidats les plus probables sont les objets d'historique/outils/interface utilisateur retenus, les clones de l'historique complet, les intermédiaires de compression et les accumulateurs de flux/journaux.
- La PR `#4186` est une mitigation utile car elle peut compacter en fonction de la pression du heap avant que les seuils de tokens ne se déclenchent, et elle supprime un clonage inutile de l'historique complet. Elle ne doit pas être considérée comme une preuve que la rétention des grandes sorties d'outils, la rétention de l'historique de l'interface utilisateur ou la mémoire de pointe de compression sont déjà résolues.

## Plan de validation des longues tâches

Le prochain benchmark doit garder deux pistes séparées :

1. Attribution démarrage/configuration : configuration normale vs MCP désactivé vs `chrome-devtools` uniquement vs attribution sans relance. Cela explique ce que les utilisateurs voient avant que le travail significatif ne commence.
2. Croissance d'exécution des longues tâches : appels d'outils répétés, grandes sorties, compression, reprise et historique d'interface utilisateur interactif. Cela explique l'OOM après un vrai travail.

Cas de longues tâches recommandés :

| Cas | Forme | Pourquoi c'est important |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Boucle de révision de PR longue | Répéter les invites de révision de PR moyenne/grande pendant 30, 60 et 120 minutes, avec un modèle et une configuration fixes | Le plus proche des workflows d'agents rapportés ; capture les tours, les appels d'outils, la croissance des tokens et la tendance RSS/heap |
| Rétention de grande sortie d'outil | Produire de manière répétée des sorties de commande limitées à 1 Mio / 5 Mio / 20 Mio, puis poser des questions de suivi | Teste si la sortie brute est retenue localement après la troncature côté modèle |
| Pression de compression | Utiliser une limite d'old space contrôlée plus basse et des invites à grand contexte pour déclencher la compaction sous pression du heap | Vérifie que la PR `#4186` se déclenche avant l'OOM et si la compression elle-même crée un nouveau pic |
| Historique TUI interactif | Exécuter la même boucle longue en mode TUI tmux et comparer avec le mode non interactif | Isole l'historique de l'interface utilisateur, la sortie statique d'Ink, les diffs rendus et la rétention d'affichage des sorties terminal |
| Stress de reprise | Reprendre une grande session sauvegardée et continuer immédiatement le travail | Cible les rapports d'OOM de `/resume` et le coût de reconstruction de session |
| Accumulateur de flux/journaux | Forcer des réponses longues en streaming avec télémétrie/journaux activés vs désactivés | Teste le chemin suspecté des `collected responses` / rétention de journaux issu de l'analyse des issues |
| MCP inactif vs MCP actif | Exécuter sans MCP, `chrome-devtools` configuré mais non utilisé, et `chrome-devtools` activement utilisé | Sépare le RSS inactif des enfants MCP de l'exécution réelle des outils MCP et de la surcharge de schéma/token |

Mesures à enregistrer par tour ou par intervalle d'échantillonnage :

- RSS racine actuel/pic et RSS d'arbre de processus actuel/pic.
- Nombre de processus enfants et formes des commandes enfants principales.
- `heapUsed`, `heapTotal`, `heap_size_limit`, `external` et `arrayBuffers` de V8.
- Nombre de tours, nombre de requêtes, nombre d'appels d'outils et nombre de rounds d'appels d'outils.
- Tokens d'entrée/sortie/cache/total par requête et par tâche complète.
- Octets du corps de la requête, octets du prompt système, octets du schéma d'outil et octets des réponses de fonction.
- Nombre de résultats d'outils, octets totaux capturés des résultats d'outils, octets max des résultats d'outils et octets retenus des résultats d'outils si disponibles.
- Nombre de messages dans l'historique de conversation et taille approximative en octets de l'historique.
- Nombre d'éléments d'historique UI interactif uniquement et taille d'affichage retenue approximative.
- Tentatives de compression, raison du déclenchement de la compression, tokens avant/après, pression du heap avant/après et statut d'échec de la compression.
- Instantané du heap ou artefacts de chronologie de mémoire bornée lorsque la pression du heap dépasse un seuil configuré.

Critères de validation :

1. Répéter au moins deux fois les cas de longues tâches clés. Le RSS de démarrage présente une variance visible, les conclusions basées sur une seule exécution doivent donc être évitées.
2. Rapporter le RSS racine et le RSS de l'arbre de processus séparément. La pression mémoire visible par l'utilisateur peut provenir des processus enfants, tandis que l'OOM V8 provient du heap racine de Qwen.
3. Considérer une ligne de RSS plate comme une preuve importante. Si les tokens et les appels d'outils augmentent mais que le heap/RSS reste plat, le problème est probablement ailleurs.
4. Lorsque le RSS ou le heap augmente, corréler la croissance avec un signal spécifique : octets de résultats d'outils, octets d'historique, nombre d'historiques UI, événement de compression, taille de l'accumulateur de flux ou démarrage d'un processus MCP.
5. Si un instantané du heap est pris, écrire d'abord un JSON de diagnostic structuré, puis l'instantané. Les instantanés du heap peuvent être volumineux et contenir des chaînes sensibles, ils doivent donc rester optionnels et locaux.

## Reproduction de révision longue interactive

Après que les invites courtes non interactives aient continué à se terminer avant la fenêtre cible, un benchmark interactif TUI a été exécuté avec une entrée distante. Le processus CLI est resté actif dans une session tandis qu'un contrôleur soumettait un vrai tour de révision de PR à la fois. Le tour suivant n'était soumis qu'après que l'assistant ait émis le marqueur de fin de ce tour. Cela évite de traiter une invite courte unique comme une reproduction de longue tâche.
Configuration :

- Installé Qwen Code `0.15.11`, modèle `qwen-latest-series-invite-beta-v28`.
- Répertoire home CLI temporaire dérivé des paramètres normaux, avec la configuration MCP et hooks supprimée. Aucune configuration globale modifiée.
- Mode TUI interactif avec sortie d'événements JSON double et entrée JSONL distante.
- Revue de PR statique uniquement. Le prompt interdisait l'installation de dépendances, la construction, les tests, Playwright, Docker et autres commandes de build externes longues.
- Des échantillonneurs RSS externes ont enregistré à la fois le RSS de l'arbre de processus et le RSS racine du nœud Qwen toutes les 5 secondes.

Résultat :

| Signal                                        |       Valeur |
| --------------------------------------------- | -----------: |
| Temps écoulé avant sortie                     |    41,9 min  |
| Statut de sortie                              |            1 |
| Tours de revue de PR terminés                 |            6 |
| Enregistrements de chat principal             |        1 076 |
| Télémétrie des réponses API                   |          335 |
| Télémétrie des appels d'outils                |          607 |
| Télémétrie des appels d'outils MCP            |            0 |
| Réponses API principales/racine               |           36 |
| Réponses API sous-agent                       |          299 |
| Tokens totaux racine                          |       2,08 M |
| Tokens totaux sous-agent                      |      17,24 M |
| Tokens totaux de télémétrie API               |      19,32 M |
| Max tokens d'entrée racine                    |      85 655  |
| Max tokens d'entrée sous-agent                |     215 207  |
| RSS max (`/usr/bin/time -l`)                   | 1 072,4 MiB  |
| Pic RSS racine Qwen échantillonné             | 1 028,2 MiB  |
| Pic RSS arbre de processus échantillonné      | 1 038,1 MiB  |

Le processus s'est terminé avec :

```text
libc++abi: terminating due to uncaught exception of type std::__1::system_error: thread constructor failed: Resource temporarily unavailable
```

Il s'agit d'une erreur d'**épuisement de threads**, pas d'un OOM du tas V8. Le mécanisme de défaillance est distinct : le système d'exploitation a refusé de créer un nouveau thread, probablement en raison de limites de ressources par processus (`RLIMIT_NPROC`) ou d'une fragmentation mémoire empêchant l'allocation de pile. C'est toujours pertinent car cela s'est produit dans une revue interactive longue session avec MCP désactivé, sans build/test, où le processus Qwen Node lui-même a dépassé environ 1 GiB RSS.

La défaillance s'est produite lors de la phase de résumé final, après que le contrôleur avait déjà terminé six tours de revue.

Chronologie des tours et RSS racine Qwen échantillonné :

| Fenêtre         | État du tour         | RSS max racine Qwen | RSS racine Qwen en fin de fenêtre |
| --------------- | -------------------- | ------------------: | --------------------------------: |
| 0,0–9,0 min     | tour 1 terminé       |         701,2 MiB   |                       255,3 MiB   |
| 9,0–15,1 min    | tour 2 terminé       |         503,2 MiB   |                       494,4 MiB   |
| 15,1–24,1 min   | tour 3 terminé       |         468,7 MiB   |                       457,5 MiB   |
| 24,1–31,9 min   | tour 4 terminé       |         619,3 MiB   |                       602,3 MiB   |
| 31,9–40,3 min   | tour 5 terminé       |         955,5 MiB   |                       955,5 MiB   |
| 40,3–40,4 min   | tour 6 terminé       |         988,6 MiB   |                       988,6 MiB   |
| 40,4–41,9 min   | résumé final / sortie |       1 028,2 MiB   |                     1 028,2 MiB   |

Répartition des tokens et des outils :

| Propriétaire    | Réponses API | Tokens d'entrée | Tokens de sortie | Tokens totaux | Entrée max |
| --------------- | -----------: | --------------: | ---------------: | ------------: | ---------: |
| Session racine  |           36 |        2,06 M   |         22,2 K   |     2,08 M    |    85 655  |
| Sous-agents     |          299 |       17,08 M   |        154,6 K   |    17,24 M    |   215 207  |

Télémétrie des appels d'outils par fonction :

| Outil                | Appels | Longueur du contenu capturé |
| -------------------- | -----: | -------------------------: |
| `read_file`          |    271 |                    1,46 Mo |
| `run_shell_command`  |    181 |                  164,4 Ko  |
| `web_fetch`          |     80 |                  846,3 Ko  |
| `grep_search`        |     25 |                   15,0 Ko  |
| `glob`               |     15 |                   27,8 Ko  |
| `todo_write`         |     16 |                   16,1 Ko  |
| `list_directory`     |      8 |                    6,2 Ko  |
| `agent`              |     10 |                        0   |
| `tool_search`        |      1 |                    2,1 Ko  |

Le compteur de tokens TUI visible le plus élevé pour un seul agent a atteint environ 3,83 M tokens. La télémétrie montre également le sous-agent le plus lourd à environ 4,05 M tokens au total avec une requête d'entrée max de 215 K tokens. Cela fait de l'amplification des sous-agents le signal dominant dans cette reproduction.

Interprétation :

1. Cette exécution sépare la croissance de session longue de la mémoire de démarrage/configuration MCP. MCP était désactivé et il n'y avait aucun appel d'outil MCP, pourtant le processus racine Qwen a quand même atteint environ 1 GiB RSS.
2. Le pic mémoire tardif coïncide avec les tours de revue lourds en sous-agents et le résumé/fusion final, pas avec les processus enfants externes de build/test.
3. La courbe RSS n'est pas une fuite linéaire simple. Elle chute après les premiers tours, puis monte fortement après les tours de sous-agents ultérieurs et reste élevée près de la sortie.
4. Le mode de défaillance est un épuisement des ressources natives plutôt qu'une pile de limite de tas V8, donc la prochaine exécution devrait ajouter un échantillonnage du tas/externe/arrayBuffer/nombre de threads. Le RSS seul ne peut pas distinguer le tas JS des allocations natives ou de la pression sur les ressources de threads.
5. Les chemins de code les plus forts à inspecter restent la rétention des transcriptions des sous-agents, la fusion des résultats d'agent, le clonage de l'historique complet, l'enregistrement de points de contrôle/session, et l'assemblage du résumé/historique final.

## Reproduction déterministe de la pression de clonage de tâche énorme

Un harnais de stress déterministe a été ajouté sous `scripts/memory-pressure-repro.mjs`. Il n'appelle pas de modèle. Au lieu de cela, il construit un graphe d'objets de session longue semblable à Qwen avec des tours de revue racine, des transcriptions de sous-agents, de grands résultats d'outils, un JSON de point de contrôle et des copies `structuredClone()` conservées. Cela donne une reproduction reproductible pour le pic de clonage et de point de contrôle suspecté à partir de la pile OOM fournie par l'utilisateur.

Le harnais a un test de script léger :

```bash
npx vitest run --config ./scripts/tests/vitest.config.ts \
  scripts/tests/memory-pressure-repro.test.js
```

Résultat : réussi, 1 test.

Les exécutions contrôlées ont utilisé `node --max-old-space-size=256` sauf indication contraire.

| Cas                                              | Forme de l'historique                                                         | Pression de clonage/point de contrôle               | Résultat                              |   RSS max |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------- | --------: |
| Petit test de base                               | 2 tours, résultat d'outil 2 KiO, 1 sous-agent                                 | 1 clone + 1 point de contrôle                      | réussi ; JSON historique 2,6 MiO      |  89,7 MiO |
| Énorme, build uniquement                        | 12 tours, résultat d'outil 256 KiO, 2 sous-agents x 12 tours de sous-agents   | aucun clone/point de contrôle conservé              | réussi ; JSON historique 76,2 MiO     | 491,5 MiO |
| Énorme + 1 clone                                | identique ci-dessus                                                           | 1 `structuredClone()` conservé                     | réussi                               | 569,6 MiO |
| Énorme + 2 clones                               | identique ci-dessus                                                           | 2 copies `structuredClone()` conservées            | OOM, sortie 134                      | 496,5 MiO |
| Énorme + 1 point de contrôle                    | identique ci-dessus                                                           | un point de contrôle avec historique original + cloné | réussi ; JSON point de contrôle 152,5 MiO | 926,9 MiO |
| Énorme + 2 points de contrôle                   | identique ci-dessus                                                           | deux copies de point de contrôle                    | OOM, sortie 134                      | 920,1 MiO |
| Énorme + 2 clones, sans transcriptions sous-agent conservées | sorties sous-agent générées identiques, mais historique parent ne conserve que les résumés | réussi ; JSON historique parent tombe à 3,8 MiO | 136,8 MiO |

L'exécution de clonage énorme ayant échoué a produit :

```text
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

La pile native incluait :

- `v8::internal::ValueDeserializer::ReadObjectInternal`
- `v8::internal::ValueDeserializer::ReadDenseJSArray`
- `node::worker::Message::Deserialize`
- `node::worker::StructuredClone`

Cela correspond à la même famille de pile que le journal OOM fourni par l'utilisateur. La reproduction contrôlée montre aussi pourquoi les rapports d'utilisateurs de 4 GiB / 8 GiB sont plausibles : la défaillance n'est pas causée par un seul grand objet, mais par un état (historique/résultats d'outils/sous-agents) conservé important, plus une ou plusieurs copies de clone ou de point de contrôle de l'historique complet. Augmenter `--max-old-space-size` peut retarder le crash tout en préservant le même modèle d'amplification.

Attribution importante de cette exécution déterministe :

1. Construire un JSON d'historique parent de 76,2 MiO peut réussir sous le tas réduit. L'OOM apparaît lorsque des copies supplémentaires de clone/point de contrôle de l'historique complet sont conservées.
2. Une seule copie de point de contrôle peut pousser le RSS près de 1 GiO même avant OOM.
3. Supprimer les transcriptions de sous-agents conservées de l'historique actif parent transforme la même charge de travail générée d'un OOM à une petite exécution de 136,8 MiO RSS. C'est le signal d'atténuation le plus clair jusqu'à présent.
4. Ce reproducteur est synthétique et intentionnellement adversarial, mais il exerce la même forme de graphe d'objets que la revue interactive longue : session parent, sous-agents, sorties d'outils volumineuses, fusion de transcriptions et pression de clonage de l'historique complet.

## Suivi de la taille de PR DeepSeek

Après la matrice de modèles initiale, une exécution supplémentaire uniquement avec Qwen Code a testé `DeepSeek/deepseek-v4-pro` sur trois tailles de PR réelles. Ce modèle est configuré via le protocole compatible Anthropic ; l'exécution compatible OpenAI a retourné 404 lors d'une vérification rapide, donc le benchmark réussi utilise `--auth-type anthropic`.

La branche de diagnostic a été étendue pour enregistrer les résumés de requêtes filaires Anthropic avec la même règle de confidentialité que le chemin OpenAI : uniquement les comptes agrégés et les tailles en octets, pas de texte de prompt, contenu de diff, arguments d'outil, en-têtes, URL de base ou clé API.

Tailles de PR :

| Taille | PR      | État   | Fichiers | Lignes modifiées | Titre                                                                   |
| ------ | ------- | ------ | ------: | ---------------: | ----------------------------------------------------------------------- |
| petite | `#4268` | fusionné |       1 |                1 | fix(serve): add mcp_guardrails to E2E capabilities expectation          |
| moyenne| `#4186` | fusionné |       6 |              494 | fix(core): add heap-pressure auto-compaction safety net                 |
| grande | `#4168` | ouverte |      25 |            4 750 | feat(core)!: redesign auto-compaction thresholds with three-tier ladder |

Temps d'exécution :

| Taille | PR      | Durée  | Tours | Tokens totaux | Tokens lus en cache | Pic RSS arbre | Pic RSS racine | Tas final | RSS final |
| ------ | ------- | -----: | ----: | ------------: | ------------------: | ------------: | -------------: | --------: | --------: |
| petite | `#4268` | 39,7 s |     2 |       43 362   |            28 672   |   346,9 MiO   |    344,8 MiO   | 115,2 MiO | 304,3 MiO |
| moyenne| `#4186` | 142,6 s|     4 |      135 120   |           115 840   |   340,7 MiO   |    337,3 MiO   | 103,5 MiO | 285,6 MiO |
| grande | `#4168` | 191,1 s|     8 |      386 891   |           332 928   |   360,0 MiO   |    336,3 MiO   | 119,3 MiO | 237,9 MiO |

Diagnostics des requêtes et des outils :

| Taille | PR      | Requêtes | Requêtes filaires Anthropic | Corps Anthropic max | Système max | Schéma d'outil max | Appels d'outils | Résultat outil total | Résultat outil max | Réponse de fonction max dans la requête |
| ------ | ------- | -------: | --------------------------: | ------------------: | ----------: | -----------------: | --------------: | -------------------: | -----------------: | --------------------------------------: |
| petite | `#4268` |        2 |                           2 |          103,0 KiO  |   50,8 KiO  |         47,6 KiO   |              3 |             0,6 KiO  |          0,5 KiO   |                               1,1 KiO   |
| moyenne| `#4186` |        4 |                           4 |          159,8 KiO  |   50,8 KiO  |         47,6 KiO   |              5 |            30,2 KiO  |         29,3 KiO   |                              56,7 KiO   |
| grande | `#4168` |        8 |                           8 |          289,5 KiO  |   50,8 KiO  |         47,6 KiO   |             11 |           235,0 KiO  |        232,1 KiO   |                             182,4 KiO   |

Observations DeepSeek :

1. La taille de la PR a clairement mis à l'échelle les tours, les tokens, la taille du corps filaire Anthropic et la taille des résultats d'outils, mais n'a pas mis à l'échelle le RSS proportionnellement. Les pics RSS de l'arbre pour les petites/moyennes/grandes tailles sont restés dans une bande étroite de `340,7–360,0 MiO`.
2. La grande PR était coûteuse principalement en tours de modèle et volume de tokens : 8 requêtes et 386 891 tokens au total. Son corps Anthropic max était de 289,5 KiO, bien plus grand que les exécutions compatibles OpenAI, mais le RSS est resté proche de la même bande de bundle local.
3. Le coût statique des requêtes Anthropic est également visible : le prompt système est d'environ 50,8 KiO et le schéma d'outil d'environ 47,6 KiO par requête. Les tours répétés sont donc un amplificateur de tokens majeur.
4. La grande PR a produit 235,0 KiO de résultats d'outils capturés et 182,4 KiO de réponse de fonction max dans une requête. C'est plus élevé que les cas précédents de petite PR / navigation de code et montre que les grandes PR exercent toujours une pression sur la gestion locale des résultats d'outils et l'assemblage des requêtes, même lorsque le RSS ne monte pas en flèche.
5. L'exécution DeepSeek renforce la conclusion sur le choix du modèle : le choix du fournisseur/modèle change fortement les tours, la latence, le volume de tokens et la forme de la charge utile filaire, mais le pic RSS du bundle local reste dominé par la forme d'exécution de Qwen Code plutôt que de s'adapter linéairement à la taille de la PR.

## Rejeu JSONL de revue longue : Pression de clonage de l'historique

Un enregistrement de chat de revue de PR longue récent a été analysé comme forme post-mortem pour la classe OOM rapportée. Le JSONL brut n'est pas inclus ici car il contient du texte de prompt et de sortie d'outil. La forme agrégée est :

| Signal                              | Valeur                        |
| ----------------------------------- | ----------------------------- |
| Durée                               | 87,0 min                      |
| Version de Qwen Code                | 0.15.10                       |
| Modèle                              | qwen-latest-series beta model |
| Réponses API                        | 380                           |
| Télémétrie des appels d'outils      | 507 événements                |
| Télémétrie des appels d'outils MCP  | 4 événements                  |
| Réponses API sous-agent             | 313                           |
| Réponses API racine                 | 67                            |
| Croissance du prompt racine         | 38 622 → 168 555 tokens       |
| Tokens de prompt max                | 168 555                       |
| Tokens de réponse totaux            | 31,28 M                       |

Cette forme ne soutient pas MCP comme cause principale d'OOM pour ce cas. Seulement 4 des 507 événements de télémétrie d'appels d'outils étaient MCP, et les quatre ont enregistré `content_length=0`. La forme dominante est l'amplification session longue/sous-agent : 15 appels `agent` ont produit 313 réponses API de sous-agent et 403 événements d'appels d'outils de sous-agent.

Le rejeu a ensuite reconstruit la forme des messages `Content[]` du chat à partir du JSONL et a exécuté des tests de pression contrôlés de clone/stringify. La charge utile de messages conservée de base est petite, donc elle n'est pas suffisante en elle-même pour provoquer un OOM :

| Échelle de rejeu | Clones conservés | JSON d'historique | JSON de point de contrôle | Tas final | RSS final  |
| ---------------- | ---------------: | ----------------: | ------------------------: | --------: | ---------: |
| 1x               |                8 |          0,54 Mo  |                  1,08 Mo  |  18,0 Mo  |  88,8 Mo   |
| 30x              |                8 |         14,46 Mo  |                 28,92 Mo  | 260,0 Mo  | 577,8 Mo   |
| 60x              |                8 |         28,86 Mo  |                 57,71 Mo  | 510,3 Mo  | 960,8 Mo   |

Le rejeu à l'échelle n'est pas une affirmation de données utilisateur ; c'est une amplification contrôlée de la forme JSONL observée pour tester si le clonage de l'historique complet et la sérialisation des points de contrôle peuvent créer le même mode de défaillance que les rapports.

Une reproduction à faible tas avec `--max-old-space-size=256` confirme le mécanisme :

| Cas                      | JSON d'historique | Résultat                                                |
| ------------------------ | ----------------: | ------------------------------------------------------- |
| Construction historique seulement |      38,4 Mo  | Réussi ; tas 131,6 Mo, RSS 378,2 Mo                     |
| Construction + un clone  |      38,4 Mo     | Réussi ; tas 183,3 Mo, RSS 463,4 Mo                     |
| Construction + clones répétés |   38,4 Mo     | OOM après plusieurs copies `structuredClone()` conservées |
| Double historique de point de contrôle | 38,4 Mo | OOM tout en conservant historique + historique client cloné |

La pile OOM des clones répétés contient `ValueDeserializer::ReadObjectInternal`, `ValueDeserializer::ReadDenseJSArray`, `node::worker::Message::Deserialize` et `node::worker::StructuredClone`, correspondant à la même famille de pile que celle observée dans le journal OOM fourni par l'utilisateur. Cela prouve que `structuredClone()` sur l'historique complet peut être le déclencheur immédiat de l'OOM sans aucune implication de serveur MCP.

Hypothèse de travail actuelle pour cette classe JSONL :

1. MCP peut expliquer le RSS de démarrage de configuration normale dans des benchmarks séparés, mais ce n'est pas le déclencheur probable pour cette forme d'OOM de revue longue.
2. La croissance de tâche longue provient de l'historique de chat conservé, de grandes sorties d'outils, des historiques de sous-agents, des messages d'agent observables et de l'état UI/résultats d'outils.
3. Le déclencheur immédiat d'OOM peut être un clone de l'historique complet ou une double sérialisation de type point de contrôle après que le tas est déjà élevé.
4. La compression peut atténuer l'historique conservé, mais la compression elle-même peut créer un pic temporaire si elle clone ou sérialise d'abord un grand historique.

### Validation de l'atténuation locale : Cas de revue PR avec MCP désactivé

Deux atténuations ciblées ont été appliquées localement et validées avant de réexécuter un cas de revue PR avec MCP désactivé :

1. `checkNextSpeaker()` lit désormais uniquement le dernier message organisé avec `getHistoryTail(1, true)` et envoie uniquement ce message à la requête side du prochain orateur. Le prompt du prochain orateur ne demande que la réponse modèle immédiatement précédente, donc envoyer l'historique complet était une pression inutile de clone et de tokens.
2. `AgentToolInvocation` ne conserve plus les tableaux `responseParts` complets dans l'affichage en direct `task_execution.toolCalls`. Les vraies parties de réponse circulent toujours via les chemins de transcription/historique, mais l'affichage UI parent conserve désormais uniquement un résumé textuel limité pour le streaming de résultats d'outils imbriqués, au lieu de conserver une autre copie complète des grandes sorties d'outils de sous-agents lors des longues exécutions.
3. `GeminiChat.sendMessageStream()` construit désormais le contenu des requêtes modèle via une vue d'historique organisé interne au lieu d'appeler `getHistory(true)` publique. `getHistory()` publique retourne toujours un `structuredClone()` défensif pour les appelants externes, mais le chemin chaud des requêtes ne clone plus en profondeur tout l'historique de chat conservé avant chaque appel modèle.

Vérifications TDD ajoutées pour ces atténuations :

| Test                                                                                                           | Protection attendue                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `checkNextSpeaker > should send only the last curated model message to the side query`                         | Empêche le clone/envoi de l'historique complet dans les vérifications du prochain orateur |
| `AgentTool > should not retain responseParts in live tool call display after TOOL_RESULT`                      | Empêche l'affichage en direct du sous-agent de conserver de grandes réponses d'outil     |
| `AgentTool > should keep only a bounded result summary in live tool call display`                              | Préserve la lisibilité des résultats imbriqués sans conserver le corps complet de la réponse |
| `GeminiChat > sendMessageStream > does not deep-clone the full curated history when building request contents` | Empêche la configuration de la requête d'atteindre le chemin OOM `ValueDeserializer` / `StructuredClone` |
Reproduction supplémentaire et validation du correctif :

| Étape                               | Format de commande                                                                                                                               | Résultat                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pression de clone déterministe avant correctif | `node --max-old-space-size=256 scripts/memory-pressure-repro.mjs ... --clone-count=2 --mode=clone`                                               | OOM, code de sortie 134 ; stderr contenait `Reached heap limit` et `ValueDeserializer` / `StructuredClone` ; RSS max 528.1 MiB lors de l'exécution répétée   |
| Test rouge                          | test ciblé `GeminiChat` avec `structuredClone` forcé de lever une exception lors de la configuration de la requête                              | échoué dans `GeminiChat.getHistory()` avant la mitigation                                                                                                    |
| Test vert                           | même test ciblé `GeminiChat` après la mitigation                                                                                                 | réussi                                                                                                                                                        |
| Test de fumée du code compilé       | `node --max-old-space-size=256` contre le paquet core compilé, avec un historique de 96 entrées / environ 48 MiB et `structuredClone` forcé de lever | réussi ; la requête avait 97 contenus ; RSS du processus 161.4 MiB, `/usr/bin/time -l` RSS max 161.6 MiB                                                     |

Cela affine la déclaration précédente concernant la « même famille de pile » : l'OOM synthétique déterministe prouve toujours que les clones complets de l'historique conservé peuvent échouer dans la même famille de pile V8 que le journal utilisateur, tandis que le nouveau test rouge/vert `GeminiChat` prouve qu'un chemin réel de configuration de requête en production n'atteint plus ce point de clonage. Les mécanismes internes de point de contrôle/reprise et de compression nécessitent encore une validation distincte en longue durée car ils peuvent légitimement nécessiter une copie durable de l'historique.

Commandes de vérification :

| Commande                                                                                             | Résultat                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run src/core/geminiChat.test.ts`                                                         | réussi, 89 tests                                                                                                                                |
| `npx vitest run src/utils/nextSpeakerChecker.test.ts --coverage=false`                               | réussi, 13 tests                                                                                                                                |
| `npx vitest run src/tools/agent/agent.test.ts --coverage=false`                                      | réussi, 77 tests                                                                                                                                |
| `npx vitest run --config ./scripts/tests/vitest.config.ts scripts/tests/memory-pressure-repro.test.js` | réussi, 1 test                                                                                                                                  |
| `npm run build --workspace=packages/core`                                                            | réussi                                                                                                                                          |
| `npm run build --workspace=packages/cli`                                                             | réussi                                                                                                                                          |
| `npm run typecheck --workspace=packages/core`                                                        | réussi                                                                                                                                          |
| `npm run typecheck --workspace=packages/cli`                                                         | réussi                                                                                                                                          |
| `npm run bundle`                                                                                     | réussi                                                                                                                                          |
| `npm run build`                                                                                      | échoué dans le lint de `packages/vscode-ide-companion` en raison des règles d'import existantes `import/no-internal-modules` ; les tests du core, CLI, bundle et les tests ciblés ci-dessus ont réussi |

La commande racine `npm run build` complète n'était pas propre dans cet espace de travail car le paquet `vscode-ide-companion` a rencontré des erreurs de lint `import/no-internal-modules` préexistantes. La compilation du core/CLI et le bundle nécessaires au test d'exécution local se sont déroulés avec succès.

Le même prompt de révision de PR a ensuite été exécuté avec une configuration temporaire où MCP et les hooks étaient désactivés. Les deux lignes ont été interrompues après une fenêtre de longue durée limitée au lieu d'attendre la fin complète de la révision. **Attention** : les deux exécutions sont confondues par la taille de la charge de travail (79K contre 390K tokens) et ne peuvent pas être comparées comme une expérience contrôlée. La comparaison ne montre qu'une indication directionnelle.

| Variante         | Temps d'exécution | Serveurs MCP | Outils | Messages de l'assistant | Blocs d'utilisation d'outils / résultats | Identifiants d'outils parents | Tokens totaux | Tokens d'entrée max | RSS max racine |
| ---------------- | ----------------: | -----------: | -----: | ---------------------: | --------------------------------------: | ---------------------------: | ------------: | -----------------: | -------------: |
| avant correctif  |           365.08s |            0 |     19 |                     42 |                         42 / 42 |                             3 |        79,439 |             26,807 |      357.7 MiB |
| après correctif  |           404.52s |            0 |     19 |                     58 |                         52 / 42 |                             2 |       390,339 |             54,000 |      310.5 MiB |

Ce n'est pas un benchmark de modèle déterministe comparable : l'exécution corrigée a effectué plus de travail et consommé nettement plus de tokens totaux avant l'arrêt manuel. Le signal utile est plus étroit : dans un cas de révision avec MCP désactivé et plus de travail observé, le RSS max racine n'a pas augmenté et était environ 47.2 MiB plus bas. Cela soutient la direction de la correction, mais ne prouve pas que toute la classe d'OOM de longue durée est corrigée.

Chemins de clonage/rétention à haut risque restants à inspecter :

1. La compression appelle toujours `getHistory(true)` complet avant la synthèse. Si le tas est déjà élevé, la tentative de compression peut créer le pic qui déclenche l'OOM.
2. La création d'un point de contrôle peut détenir simultanément l'historique original, l'historique client cloné, et une charge utile de point de contrôle sérialisée.
3. Les sous-agents forkés s'initialisent toujours à partir de l'historique parent avec `getHistory(true)`.
4. Les chemins d'exportation/synthèse/copie de l'historique ACP appellent toujours `getHistory()` complet et doivent être audités séparément de la boucle de révision normale.

Chronologie des versions :

| Ticket | Créé       | Version signalée         | Signal                                                                               |
| ------ | ---------- | ------------------------ | ------------------------------------------------------------------------------------ |
| #2128  | 2026-03-05 | non spécifié             | Croissance mémoire de l'interface utilisateur en session longue                      |
| #2562  | 2026-03-21 | non spécifié             | OOM structuredClone dans les sessions longes                                        |
| #2868  | 2026-04-03 | 0.13.2                   | OOM du tas                                                                            |
| #2945  | 2026-04-07 | 0.14.0                   | OOM du tas V8                                                                        |
| #4116  | 2026-05-13 | 0.15.11                  | OOM avec analyse de style structuredClone                                            |
| #4134  | 2026-05-14 | 0.15.11                  | OOM                                                                                   |
| #4149  | 2026-05-14 | 0.15.10-nightly.20260513 | OOM du tas V8                                                                        |
| #4167  | 2026-05-15 | 0.15.11                  | Crash près de la compression                                                         |
| #4185  | 2026-05-15 | 0.15.11                  | Pression du tas avant compactage des tokens                                          |
| #4254  | 2026-05-17 | non spécifié             | La mémoire continue d'augmenter                                                       |
| #4276  | 2026-05-18 | 0.15.11                  | OOM du tas V8                                                                        |
| #4309  | 2026-05-19 | 0.15.11                  | Avertissement de mémoire élevée autour de 7 GiB                                      |

L'historique des tickets ne prouve pas que la version 0.15.10 a introduit la classe d'OOM ; des signalements similaires existaient en mars et avril. Il soutient toutefois un groupe récent commençant vers 2026-05-13, chevauchant les versions `v0.15.10`/`v0.15.11`. Le diff pertinent entre `v0.15.9` et `v0.15.10` a fortement touché le runtime des sous-agents, l'exécution non interactive, `GeminiChat`, et le code de compression, donc cette plage est une première fenêtre de bissection raisonnable.

## Notes

- Le premier prompt de navigation de code a permis une exploration ouverte et a atteint `maxSessionTurns` ; les lignes réussies ci-dessus utilisent une liste de commandes contrainte.
- La première tentative de diff synthétique utilisait un chemin de bundle relatif depuis l'intérieur des dépôts temporaires ; celles-ci ont échoué immédiatement et sont exclues des tableaux. Les lignes réussies utilisent le chemin absolu du bundle local.
- Les flux JSONL bruts ne sont pas commités car ils contiennent des prompts, des commandes d'outils et des sorties d'outils. Le rapport n'inclut que des diagnostics agrégés.