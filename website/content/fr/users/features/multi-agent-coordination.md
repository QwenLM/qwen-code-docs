# Coordination multi-agent

Qwen Code peut coordonner plusieurs coéquipiers avec le runtime expérimental Agent Team. Les coéquipiers reçoivent des tâches séparées, partagent une liste de tâches, échangent des messages et apparaissent dans les onglets existants de Agent View. `/coordinate` assigne par défaut aux workers d'investigation un ensemble d'outils en lecture seule imposé et peut placer un writer dans un worktree Git possédé par le leader.

## Activer Agent Team

Définissez `experimental.agentTeam` à `true` dans les paramètres de Qwen Code et redémarrez, ou démarrez Qwen Code avec `QWEN_CODE_ENABLE_AGENT_TEAM=1`.

## Exécuter une tâche coordonnée

Utilisez le skill intégré avec un objectif :

```text
/coordinate investigate the authentication regression and propose the smallest fix
```

Le leader crée une équipe, assigne jusqu'à trois flux de travail indépendants, et utilise les outils d'équipe existants pour les messages et l'état des tâches. Les conversations des coéquipiers et les approbations restent visibles via l'UI Agent View existante. Les coéquipiers en lecture seule ne peuvent pas exécuter de commandes shell ni écrire de fichiers. Si une implémentation est nécessaire, le leader peut créer un worktree Git et y épingler un coéquipier writer ; le leader reste la seule autorité de fusion pour la branche en cours.

Si Agent Team est désactivé, `/coordinate` peut toujours utiliser des agents foreground ordinaires pour une investigation parallèle en lecture seule. Ce fallback est une délégation, pas une équipe collaborante : les workers rendent compte uniquement au leader.

## Choisir le bon mode multi-agent

| Mode                          | Cas d'utilisation                                               | Communication                        | Comportement du workspace                                   |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| `/coordinate` avec Agent Team | Différents flux de travail contribuant à un seul résultat       | Tâches partagées et messages entre coéquipiers | Workers en lecture seule imposés ; writer worktree optionnel |
| Sous-agents                   | Petites tâches déléguées                                        | Le worker rend compte au parent      | Dépend de l'agent sélectionné                               |
| Arena                         | Plusieurs modèles en compétition sur la même tâche              | Les agents ne collaborent pas        | Worktrees isolés ; un gagnant est sélectionné               |
| Herdr                         | Coordination de différents produits CLI ou sessions terminal distantes | Contrôle externe au niveau terminal | Géré en dehors de Qwen Code                                |

Le workflow actuel réutilise délibérément le runtime Agent Team in-process et l'UI Agent View. Les coéquipiers héritent normalement du modèle de session, bien qu'une définition d'agent puisse le remplacer. Les sessions PTY indépendantes persistantes, les workers multi-fournisseurs et l'attachement distant sont des préoccupations produit séparées et ne sont pas implémentés par `/coordinate`.
