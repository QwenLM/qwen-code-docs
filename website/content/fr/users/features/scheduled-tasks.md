# Exécuter des prompts selon un planning

> Utilisez `/loop` et les outils de planification cron pour exécuter des prompts à répétition, interroger un statut, ou définir des rappels uniques dans une session Qwen Code.

Les tâches planifiées permettent à Qwen Code de réexécuter automatiquement un prompt à intervalle régulier. Utilisez-les pour interroger un déploiement, surveiller une PR, vérifier l'avancement d'un build de longue durée, ou vous rappeler de faire quelque chose plus tard dans la session.

Les tâches sont limitées à la session : elles vivent dans le processus Qwen Code en cours et disparaissent lorsque vous quittez. Rien n'est écrit sur le disque.

> **Tip:** Les tâches planifiées sont activées par défaut. Pour les désactiver, définissez `experimental.cron: false` dans vos [paramètres](../configuration/settings.md), ou définissez `QWEN_CODE_DISABLE_CRON=1` dans votre environnement.

## Planifier un prompt récurrent avec /loop

La [skill intégrée](skills.md) `/loop` est le moyen le plus rapide de planifier un prompt récurrent. Passez un intervalle optionnel et un prompt, et Qwen Code met en place une tâche cron qui se déclenche en arrière-plan tant que la session reste ouverte.

```text
/loop 5m check if the deployment finished and tell me what happened
```

Qwen Code analyse l'intervalle, le convertit en expression cron, planifie la tâche et confirme la cadence et l'ID de la tâche. Il exécute ensuite immédiatement le prompt une fois — vous n'avez pas à attendre le premier déclenchement cron.

### Syntaxe de l'intervalle

Les intervalles sont optionnels. Vous pouvez les placer au début, à la fin, ou les omettre complètement.

| Forme                  | Exemple                               | Intervalle interprété         |
| :--------------------- | :------------------------------------ | :---------------------------- |
| Jeton en début         | `/loop 30m check the build`           | toutes les 30 minutes         |
| Clause `every` en fin  | `/loop check the build every 2 hours` | toutes les 2 heures           |
| Sans intervalle        | `/loop check the build`               | par défaut toutes les 10 minutes |

Les unités prises en charge sont `s` pour les secondes, `m` pour les minutes, `h` pour les heures et `d` pour les jours. Les secondes sont arrondies à la minute supérieure car cron a une granularité d'une minute. Les intervalles qui ne divisent pas uniformément leur unité, comme `7m` ou `90m`, sont arrondis à l'intervalle net le plus proche et Qwen Code vous indique ce qu'il a choisi.

### Boucler sur une autre commande

Le prompt planifié peut lui-même être une commande ou une invocation de skill. Cela est utile pour réexécuter un workflow que vous avez déjà préparé.

```text
/loop 20m /review-pr 1234
```

Chaque fois que la tâche se déclenche, Qwen Code exécute `/review-pr 1234` comme si vous l'aviez tapé.

### Gérer les boucles

`/loop` prend également en charge deux sous-commandes pour gérer les tâches existantes :

```text
/loop list
```

Liste toutes les tâches planifiées avec leurs ID et expressions cron.

```text
/loop clear
```

Annule toutes les tâches planifiées d'un coup.

## Définir un rappel unique

Pour les rappels uniques, décrivez ce que vous voulez en langage naturel plutôt que d'utiliser `/loop`. Qwen Code planifie une tâche à déclenchement unique qui se supprime après son exécution.

```text
remind me at 3pm to push the release branch
```

```text
in 45 minutes, check whether the integration tests passed
```

Qwen Code fixe l'heure de déclenchement à une minute et une heure spécifiques à l'aide d'une expression cron et confirme le moment où elle se déclenchera.

## Gérer les tâches planifiées

Demandez à Qwen Code en langage naturel de lister ou d'annuler des tâches, ou référez-vous directement aux outils sous-jacents.

```text
what scheduled tasks do I have?
```

```text
cancel the deploy check job
```

En coulisses, Qwen Code utilise ces outils :

| Outil         | Objectif                                                                                                         |
| :------------ | :-------------------------------------------------------------------------------------------------------------- |
| `CronCreate`  | Planifier une nouvelle tâche. Accepte une expression cron à 5 champs, le prompt à exécuter et s'il est récurrent ou unique. |
| `CronList`    | Lister toutes les tâches planifiées avec leurs ID, plannings et prompts.                                        |
| `CronDelete`  | Annuler une tâche par son ID.                                                                                   |

Chaque tâche planifiée possède un ID de 8 caractères que vous pouvez passer à `CronDelete`. Une session peut contenir jusqu'à 50 tâches planifiées à la fois.

## Comment les tâches planifiées s'exécutent

Le planificateur vérifie chaque seconde les tâches à exécuter et les met en file d'attente lorsque la session est inactive. Un prompt planifié se déclenche entre vos tours, pas pendant que Qwen Code est en train de répondre. Si Qwen Code est occupé lorsqu'une tâche arrive à échéance, le prompt attend la fin du tour en cours.

Toutes les heures sont interprétées dans votre fuseau horaire local. Une expression cron comme `0 9 * * *` signifie 9h là où vous exécutez Qwen Code, pas UTC.

### Jitter

Pour éviter que toutes les sessions n'appellent l'API au même moment horloge, le planificateur ajoute un petit décalage déterministe aux heures de déclenchement :

- **Les tâches récurrentes** se déclenchent avec un retard allant jusqu'à 10% de leur période, plafonné à 15 minutes. Une tâche horaire peut se déclencher entre `:00` et `:06`.
- **Les tâches uniques** planifiées en haut ou en bas de l'heure (minute `:00` ou `:30`) se déclenchent jusqu'à 90 secondes plus tôt.

Le décalage est dérivé de l'ID de la tâche, donc la même tâche obtient toujours le même décalage. Si le timing exact est important, choisissez une minute qui n'est pas `:00` ou `:30`, par exemple `3 9 * * *` au lieu de `0 9 * * *`, et la gigue des tâches uniques ne s'appliquera pas.

### Expiration après trois jours

Les tâches récurrentes expirent automatiquement 3 jours après leur création. La tâche se déclenche une dernière fois, puis se supprime. Cela limite la durée d'exécution d'une boucle oubliée. Si vous avez besoin qu'une tâche récurrente dure plus longtemps, annulez-la et recréez-la avant son expiration.

Les tâches uniques n'expirent pas sur minuterie — elles se suppriment simplement après s'être déclenchées une fois.

## Référence des expressions cron

`CronCreate` accepte les expressions cron standard à 5 champs : `minute hour day-of-month month day-of-week`. Tous les champs prennent en charge les wildcards (`*`), les valeurs uniques (`5`), les pas (`*/15`), les plages (`1-5`) et les listes séparées par des virgules (`1,15,30`).

| Exemple        | Signification                 |
| :------------- | :----------------------------- |
| `*/5 * * * *`  | Toutes les 5 minutes           |
| `0 * * * *`    | Toutes les heures à l'heure    |
| `7 * * * *`    | Toutes les heures à 7 minutes  |
| `0 9 * * *`    | Tous les jours à 9h locale     |
| `0 9 * * 1-5`  | Jours de semaine à 9h locale   |
| `30 14 15 3 *` | 15 mars à 14h30 locale         |

Le jour de la semaine utilise `0` ou `7` pour dimanche et `6` pour samedi. Lorsque le jour du mois et le jour de la semaine sont tous deux contraints (aucun n'est `*`), une date correspond si l'un ou l'autre champ correspond — cela suit la sémantique standard vixie-cron.

La syntaxe étendue comme `L`, `W`, `?`, et les alias de noms tels que `MON` ou `JAN` n'est pas prise en charge.

## Limitations

La planification limitée à la session comporte des contraintes inhérentes :

- Les tâches ne se déclenchent que lorsque Qwen Code est en cours d'exécution et inactif. Fermer le terminal ou laisser la session se terminer annule tout.
- Pas de rattrapage pour les déclenchements manqués. Si l'heure planifiée d'une tâche passe pendant que Qwen Code est occupé sur une requête longue, elle se déclenche une fois lorsque Qwen Code devient inactif, pas une fois par intervalle manqué.
- Pas de persistance entre les redémarrages. Redémarrer Qwen Code efface toutes les tâches limitées à la session.