# Planifier l'exécution de prompts

> Utilisez `/loop` et les outils de planification cron pour exécuter des prompts de manière répétée, surveiller un statut ou définir des rappels ponctuels au sein d'une session Qwen Code.

Les tâches planifiées permettent à Qwen Code de réexécuter automatiquement un prompt à intervalle régulier. Utilisez-les pour surveiller un déploiement, suivre une PR, vérifier l'avancement d'un build long, ou vous rappeler de faire quelque chose plus tard dans la session.

Les tâches sont limitées à la session : elles vivent dans le processus Qwen Code actuel et disparaissent lorsque vous quittez. Rien n'est écrit sur le disque.

> **Astuce :** Les tâches planifiées sont activées par défaut. Pour les désactiver, définissez `experimental.cron: false` dans vos [paramètres](../configuration/settings.md), ou définissez `QWEN_CODE_DISABLE_CRON=1` dans votre environnement.

## Planifier un prompt récurrent avec /loop

Le [skill intégré](./skills.md) `/loop` est le moyen le plus rapide de planifier un prompt récurrent. Passez un intervalle optionnel et un prompt, et Qwen Code configure une tâche cron qui s'exécute en arrière-plan tant que la session reste ouverte.

```text
/loop 5m check if the deployment finished and tell me what happened
```

Qwen Code analyse l'intervalle, le convertit en expression cron, planifie la tâche, et confirme la cadence ainsi que l'ID de la tâche. Il exécute ensuite immédiatement le prompt une première fois — vous n'avez pas à attendre le premier déclenchement cron.

### Syntaxe des intervalles

Les intervalles sont optionnels. Vous pouvez les placer au début, à la fin, ou les omettre entièrement.

| Forme | Exemple | Intervalle analysé |
| :--- | :--- | :--- |
| Token en début | `/loop 30m check the build` | toutes les 30 minutes |
| Clause `every` en fin | `/loop check the build every 2 hours` | toutes les 2 heures |
| Pas d'intervalle | `/loop check the build` | par défaut, toutes les 10 minutes |

Les unités prises en charge sont `s` pour les secondes, `m` pour les minutes, `h` pour les heures et `d` pour les jours. Les secondes sont arrondies à la minute supérieure car cron a une granularité d'une minute. Les intervalles qui ne se divisent pas uniformément dans leur unité, comme `7m` ou `90m`, sont arrondis à l'intervalle propre le plus proche, et Qwen Code vous indique celui qu'il a choisi.

### Boucler sur une autre commande

Le prompt planifié peut lui-même être une commande ou l'invocation d'un skill. Cela est utile pour réexécuter un workflow que vous avez déjà packagé.

```text
/loop 20m /review-pr 1234
```

À chaque déclenchement de la tâche, Qwen Code exécute `/review-pr 1234` comme si vous l'aviez tapé.

### Mode autonome

Exécuter `/loop` **sans prompt** démarre une boucle autonome au lieu de répéter un prompt fixe. Qwen Code agit comme un intendant du travail déjà établi dans la conversation — il fait avancer votre travail pendant votre absence :

```text
/loop
```

Un `/loop` nu (sans prompt, sans intervalle) exécute une boucle autonome à son propre rythme ; `/loop <intervalle>` sans prompt exécute la même boucle autonome sur une cadence fixe (par ex. `/loop 10m`). À chaque déclenchement, il fait avancer ce que la conversation a déjà mis en place — terminer ce que vous avez commencé, maintenir une PR en cours (répondre aux fils de review, corriger une CI qui échoue, résoudre les conflits), et honorer les engagements de suivi. Il n'agit que sur le travail déjà établi dans l'historique : il n'invente jamais de nouveau travail ni n'apporte de modifications irréversibles (push, delete, send) sans autorisation explicite, et il s'arrête une fois que tout est calme.

### Gérer les boucles

`/loop` prend également en charge deux sous-commandes pour gérer les tâches existantes :

```text
/loop list
```

Liste toutes les tâches planifiées avec leurs IDs et expressions cron.

```text
/loop clear
```

Annule toutes les tâches planifiées d'un seul coup.

## Définir un rappel ponctuel

Pour les rappels ponctuels, décrivez ce que vous voulez en langage naturel au lieu d'utiliser `/loop`. Qwen Code planifie une tâche à déclenchement unique qui s'auto-supprime après son exécution.

```text
remind me at 3pm to push the release branch
```

```text
in 45 minutes, check whether the integration tests passed
```

Qwen Code fixe l'heure de déclenchement à une minute et une heure spécifiques à l'aide d'une expression cron et confirme quand il se déclenchera.

## Gérer les tâches planifiées

Demandez à Qwen Code en langage naturel de lister ou d'annuler des tâches, ou référencez directement les outils sous-jacents.

```text
what scheduled tasks do I have?
```

```text
cancel the deploy check job
```

Sous le capot, Qwen Code utilise ces outils :

| Outil | Objectif |
| :--- | :--- |
| `CronCreate` | Planifier une nouvelle tâche. Accepte une expression cron à 5 champs, le prompt à exécuter, et s'il est récurrent ou à déclenchement unique. |
| `CronList` | Lister toutes les tâches planifiées avec leurs IDs, planifications et prompts. |
| `CronDelete` | Annuler une tâche par son ID. |

Chaque tâche planifiée possède un ID de 8 caractères que vous pouvez passer à `CronDelete`. Une session peut contenir jusqu'à 50 tâches planifiées à la fois.

## Fonctionnement de l'exécution des tâches planifiées

Le planificateur vérifie chaque seconde les tâches échues et les met en file d'attente lorsque la session est inactive. Un prompt planifié se déclenche entre vos tours, et non pendant que Qwen Code est en train de répondre. Si Qwen Code est occupé lorsqu'une tâche arrive à échéance, le prompt attend la fin du tour en cours.

Toutes les heures sont interprétées dans votre fuseau horaire local. Une expression cron comme `0 9 * * *` signifie 9h du matin où que vous exécutiez Qwen Code, et non UTC.

### Jitter

Pour éviter que chaque session n'interroge l'API au même moment exact, le planificateur ajoute un petit décalage déterministe aux heures de déclenchement :

- Les **tâches récurrentes** se déclenchent avec un retard allant jusqu'à 10 % de leur période, plafonné à 15 minutes. Une tâche horaire peut se déclencher n'importe quand entre `:00` et `:06`.
- Les **tâches ponctuelles** planifiées au début ou à la fin de l'heure (minute `:00` ou `:30`) se déclenchent jusqu'à 90 secondes en avance.

Le décalage est dérivé de l'ID de la tâche, de sorte que la même tâche obtient toujours le même décalage. Si le timing exact est important, choisissez une minute qui n'est pas `:00` ou `:30`, par exemple `3 9 * * *` au lieu de `0 9 * * *`, et le jitter ponctuel ne s'appliquera pas.

### Expiration des tâches récurrentes

Par défaut, les tâches récurrentes expirent automatiquement 7 jours après leur création. La tâche se déclenche une dernière fois, puis s'auto-supprime. Cela limite la durée d'exécution d'une boucle oubliée.

Pour modifier cette limite, définissez `experimental.cronRecurringMaxAgeDays` dans vos [paramètres](../configuration/settings.md), ou définissez la variable d'environnement `QWEN_CODE_CRON_MAX_AGE_DAYS` (la variable d'environnement est prioritaire — pratique pour les déploiements cloud ou conteneurisés où la modification de `settings.json` est peu pratique). Une valeur de `0` désactive entièrement l'expiration, de sorte que les tâches s'exécutent jusqu'à ce que vous les supprimiez — utile pour les déploiements de démons à long terme qui hébergent des rapports quotidiens, des résumés ou une surveillance continue. La limite configurée s'applique également aux tâches durables restaurées depuis le disque après un redémarrage.

Les tâches ponctuelles n'expirent pas selon un minuteur — elles se suppriment simplement après s'être déclenchées une fois.

## Référence des expressions cron

`CronCreate` accepte les expressions cron standard à 5 champs : `minute heure jour-du-mois mois jour-de-la-semaine`. Tous les champs prennent en charge les caractères génériques (`*`), les valeurs uniques (`5`), les pas (`*/15`), les plages (`1-5`) et les listes séparées par des virgules (`1,15,30`).

| Exemple | Signification |
| :--- | :--- |
| `*/5 * * * *` | Toutes les 5 minutes |
| `0 * * * *` | Toutes les heures, à l'heure pile |
| `7 * * * *` | Toutes les heures, à 7 minutes passées |
| `0 9 * * *` | Tous les jours à 9h00, heure locale |
| `0 9 * * 1-5` | En semaine à 9h00, heure locale |
| `30 14 15 3 *` | Le 15 mars à 14h30, heure locale |

Le jour de la semaine utilise `0` ou `7` pour dimanche, jusqu'à `6` pour samedi. Lorsque le jour du mois et le jour de la semaine sont tous deux contraints (aucun n'est `*`), une date correspond si l'un ou l'autre des champs correspond — cela suit la sémantique standard de vixie-cron.

La syntaxe étendue comme `L`, `W`, `?`, et les alias de noms tels que `MON` ou `JAN` n'est pas prise en charge.

## Limites

La planification limitée à la session comporte des contraintes inhérentes :

- Les tâches ne se déclenchent que lorsque Qwen Code est en cours d'exécution et inactif. Fermer le terminal ou laisser la session se terminer annule tout.
- Pas de rattrapage pour les déclenchements manqués. Si l'heure planifiée d'une tâche passe alors que Qwen Code est occupé par une requête de longue durée, elle se déclenche une seule fois lorsque Qwen Code redevient inactif, et non une fois par intervalle manqué.
- Pas de persistance entre les redémarrages. Redémarrer Qwen Code efface toutes les tâches limitées à la session.