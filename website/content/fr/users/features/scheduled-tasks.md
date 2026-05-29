---
description: "Planifiez des Qwen Code Scheduled Tasks pour contrôles de code, rapports et automatisations récurrentes, sans déclenchement manuel à chaque fois."
---

# Planifier l'exécution de prompts

> Utilisez `/loop` et les outils de planification cron pour exécuter des prompts de manière répétée, interroger un statut ou définir des rappels ponctuels dans une session Qwen Code.

Les tâches planifiées permettent à Qwen Code de réexécuter automatiquement un prompt à intervalles réguliers. Utilisez-les pour vérifier l'état d'un déploiement, surveiller une PR, suivre un build long ou vous rappeler d'effectuer une action plus tard dans la session.

Les tâches sont limitées à la session : elles existent dans le processus Qwen Code actuel et disparaissent lorsque vous quittez. Rien n'est écrit sur le disque.

> **Remarque :** Les tâches planifiées sont une fonctionnalité expérimentale. Activez-les avec `experimental.cron: true` dans vos [paramètres](../configuration/settings.md), ou définissez `QWEN_CODE_ENABLE_CRON=1` dans votre environnement.

## Planifier un prompt récurrent avec /loop

La [compétence intégrée](skills.md) `/loop` est le moyen le plus rapide de planifier un prompt récurrent. Indiquez un intervalle optionnel et un prompt, et Qwen Code configure une tâche cron qui s'exécute en arrière-plan tant que la session reste ouverte.

```text
/loop 5m check if the deployment finished and tell me what happened
```

Qwen Code analyse l'intervalle, le convertit en expression cron, planifie la tâche et confirme la cadence ainsi que l'ID de la tâche. Il exécute ensuite immédiatement le prompt une fois — vous n'avez pas à attendre le premier déclenchement cron.

### Syntaxe des intervalles

Les intervalles sont optionnels. Vous pouvez les placer au début, à la fin, ou les omettre complètement.

| Format                    | Exemple                               | Intervalle analysé              |
| :---------------------- | :------------------------------------ | :--------------------------- |
| Jeton en début           | `/loop 30m check the build`           | toutes les 30 minutes             |
| Clause `every` en fin | `/loop check the build every 2 hours` | toutes les 2 heures                |
| Aucun intervalle             | `/loop check the build`               | par défaut, toutes les 10 minutes |

Les unités prises en charge sont `s` pour les secondes, `m` pour les minutes, `h` pour les heures et `d` pour les jours. Les secondes sont arrondies à la minute supérieure car cron fonctionne avec une granularité d'une minute. Les intervalles qui ne se divisent pas proprement dans leur unité, comme `7m` ou `90m`, sont arrondis à l'intervalle propre le plus proche et Qwen Code vous indique celui qu'il a choisi.

### Boucler sur une autre commande

Le prompt planifié peut lui-même être une commande ou un appel de compétence. Cela est utile pour réexécuter un workflow que vous avez déjà packagé.

```text
/loop 20m /review-pr 1234
```

À chaque déclenchement de la tâche, Qwen Code exécute `/review-pr 1234` comme si vous l'aviez saisi.

### Gérer les boucles

`/loop` prend également en charge deux sous-commandes pour gérer les tâches existantes :

```text
/loop list
```

Liste toutes les tâches planifiées avec leurs ID et expressions cron.

```text
/loop clear
```

Annule toutes les tâches planifiées en une seule fois.

## Définir un rappel ponctuel

Pour les rappels ponctuels, décrivez ce que vous souhaitez en langage naturel au lieu d'utiliser `/loop`. Qwen Code planifie une tâche à exécution unique qui s'auto-supprime après son exécution.

```text
remind me at 3pm to push the release branch
```

```text
in 45 minutes, check whether the integration tests passed
```

Qwen Code fixe l'heure de déclenchement à une minute et une heure précises via une expression cron et confirme le moment du déclenchement.

## Gérer les tâches planifiées

Demandez à Qwen Code en langage naturel de lister ou d'annuler des tâches, ou référencez directement les outils sous-jacents.

```text
what scheduled tasks do I have?
```

```text
cancel the deploy check job
```

En coulisses, Qwen Code utilise ces outils :

| Outil         | Objectif                                                                                                         |
| :----------- | :-------------------------------------------------------------------------------------------------------------- |
| `CronCreate` | Planifier une nouvelle tâche. Accepte une expression cron à 5 champs, le prompt à exécuter et indique si elle est récurrente ou à exécution unique. |
| `CronList`   | Lister toutes les tâches planifiées avec leurs ID, planifications et prompts.                                                |
| `CronDelete` | Annuler une tâche par ID.                                                                                            |

Chaque tâche planifiée possède un ID de 8 caractères que vous pouvez transmettre à `CronDelete`. Une session peut contenir jusqu'à 50 tâches planifiées simultanément.

## Fonctionnement des tâches planifiées

Le planificateur vérifie chaque seconde les tâches arrivées à échéance et les met en file d'attente lorsque la session est inactive. Un prompt planifié se déclenche entre vos tours, et non pendant que Qwen Code génère une réponse. Si Qwen Code est occupé lorsqu'une tâche arrive à échéance, le prompt attend la fin du tour en cours.

Toutes les heures sont interprétées dans votre fuseau horaire local. Une expression cron comme `0 9 * * *` signifie 9h là où vous exécutez Qwen Code, et non en UTC.

### Jitter

Pour éviter que toutes les sessions n'interrogent l'API à la même heure réelle, le planificateur ajoute un petit décalage déterministe aux heures de déclenchement :

- **Les tâches récurrentes** se déclenchent avec un retard pouvant atteindre 10 % de leur période, plafonné à 15 minutes. Une tâche horaire peut ainsi se déclencher entre `:00` et `:06`.
- **Les tâches ponctuelles** planifiées au début ou à la mi-heure (minute `:00` ou `:30`) peuvent se déclencher jusqu'à 90 secondes plus tôt.

Le décalage est dérivé de l'ID de la tâche, de sorte qu'une même tâche obtient toujours le même décalage. Si le timing exact est important, choisissez une minute différente de `:00` ou `:30`, par exemple `3 9 * * *` au lieu de `0 9 * * *`, et le jitter des tâches ponctuelles ne s'appliquera pas.

### Expiration après trois jours

Les tâches récurrentes expirent automatiquement 3 jours après leur création. La tâche se déclenche une dernière fois, puis s'auto-supprime. Cela limite la durée d'exécution d'une boucle oubliée. Si vous avez besoin qu'une tâche récurrente dure plus longtemps, annulez-la et recréez-la avant son expiration.

Les tâches ponctuelles n'expirent pas selon un minuteur — elles s'auto-suppriment simplement après une exécution.

## Référence des expressions cron

`CronCreate` accepte les expressions cron standard à 5 champs : `minute hour day-of-month month day-of-week`. Tous les champs prennent en charge les jokers (`*`), les valeurs uniques (`5`), les pas (`*/15`), les plages (`1-5`) et les listes séparées par des virgules (`1,15,30`).

| Exemple        | Signification                      |
| :------------- | :--------------------------- |
| `*/5 * * * *`  | Toutes les 5 minutes              |
| `0 * * * *`    | Toutes les heures, à l'heure pile       |
| `7 * * * *`    | Toutes les heures, à 7 minutes past |
| `0 9 * * *`    | Tous les jours à 9h (heure locale)       |
| `0 9 * * 1-5`  | En semaine à 9h (heure locale)        |
| `30 14 15 3 *` | Le 15 mars à 14h30 (heure locale)     |

Le jour de la semaine utilise `0` ou `7` pour dimanche jusqu'à `6` pour samedi. Lorsque le jour du mois et le jour de la semaine sont tous deux contraints (aucun n'est `*`), une date correspond si l'un des deux champs correspond — cela suit la sémantique standard de vixie-cron.

La syntaxe étendue comme `L`, `W`, `?` et les alias de noms tels que `MON` ou `JAN` ne sont pas pris en charge.

## Limitations

La planification limitée à la session comporte des contraintes inhérentes :

- Les tâches ne se déclenchent que lorsque Qwen Code est en cours d'exécution et inactif. Fermer le terminal ou quitter la session annule tout.
- Aucun rattrapage pour les déclenchements manqués. Si l'heure planifiée d'une tâche passe pendant que Qwen Code traite une requête longue, elle se déclenche une seule fois lorsque Qwen Code redevient inactif, et non une fois par intervalle manqué.
- Aucune persistance entre les redémarrages. Redémarrer Qwen Code efface toutes les tâches limitées à la session.