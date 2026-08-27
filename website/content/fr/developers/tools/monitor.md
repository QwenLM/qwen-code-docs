# Outil `monitor`

Ce document décrit l'outil `monitor` pour Qwen Code.

## Description

Utilisez `monitor` pour lancer une commande shell longue durée qui envoie en continu les lignes de stdout et stderr vers l'agent sous forme de notifications de tâche en arrière-plan. Il est conçu pour les commandes de type *watch* où une nouvelle sortie compte au fil du temps, comme le suivi de logs, la surveillance de sortie de build, l'interrogation d'un point de terminaison de santé ou l'observation de modifications de fichiers.

Le monitor s'exécute en arrière-plan, l'agent peut donc continuer à travailler pendant que les événements arrivent. Chaque ligne de sortie non vide devient un événement de notification, soumis à une limitation de débit.

### Arguments

`monitor` accepte les arguments suivants :

- `command` (chaîne, obligatoire) : la commande shell à exécuter et à surveiller.
- `description` (chaîne, facultatif) : brève description de ce que le monitor surveille. Le texte affiché est tronqué à 80 caractères.
- `max_events` (nombre, facultatif) : arrêt après ce nombre d'événements de notification. Doit être un entier positif. Par défaut `1000` ; maximum `10000` (les valeurs hors de cette plage sont rejetées, pas silencieusement ramenées à la limite).
- `idle_timeout_ms` (nombre, facultatif) : arrêt si la commande ne produit aucune sortie pendant ce nombre de millisecondes. Doit être un entier positif. Par défaut `300000` (5 minutes) ; maximum `600000` (10 minutes), et les valeurs hors de cette plage sont rejetées.
- `directory` (chaîne, facultatif) : chemin absolu dans lequel exécuter la commande. Doit résoudre (après canonicalisation des liens symboliques) dans un des répertoires de l'espace de travail enregistrés, et ne doit pas être dans le répertoire des compétences utilisateur. Si omis, Qwen Code utilise la racine du projet.

## Utiliser `monitor` avec Qwen Code

Le modèle choisit l'outil `monitor` lorsqu'il doit observer un processus dans le temps plutôt que de collecter un résultat unique de commande. Un appel réussi renvoie un ID de monitor, la commande, la limite d'événements et le délai d'inactivité.

Utilisation :

```
monitor(command="tail -f logs/app.log", description="flux de logs applicatifs")
```

La sortie du monitor est visible dans la conversation sous forme de notifications de tâche. Vous pouvez également inspecter les monitors en cours et terminés avec `/tasks` ou la boîte de dialogue interactive des tâches en arrière-plan.

Pour arrêter un monitor en cours, utilisez l'outil `task_stop` avec l'ID du monitor :

```
task_stop(task_id="mon_abc123def4567890")
```

## Exemples de `monitor`

Surveiller un log applicatif :

```
monitor(
  command="tail -f logs/app.log",
  description="flux de logs applicatifs",
  max_events=200
)
```

Surveiller un serveur de développement ou un watcher de build :

```
monitor(
  command="npm run build -- --watch",
  description="surveillance de la sortie de build",
  idle_timeout_ms=600000
)
```

Interroger un point de terminaison de santé local :

```
monitor(
  command="while true; do curl -s http://localhost:8080/health; sleep 5; done",
  description="vérification de santé locale",
  max_events=120
)
```

Exécuter depuis un répertoire spécifique de l'espace de travail :

```
monitor(
  command="npm run dev",
  description="serveur de développement frontend",
  directory="/absolute/path/to/workspace/packages/web"
)
```

## Monitor vs commandes shell en arrière-plan

Utilisez `monitor` lorsque l'agent doit réagir à une sortie en continu pendant que la commande s'exécute. Utilisez `run_shell_command` à la place lorsque vous avez besoin d'un résultat unique ou de la sortie complète de la commande.

| Besoin                                                       | Utiliser                                |
| :----------------------------------------------------------- | :-------------------------------------- |
| Surveiller des logs, une sortie de build ou des mises à jour périodiques | `monitor`                               |
| Exécuter une commande unique et lire la sortie complète      | `run_shell_command(is_background=false)` |
| Lancer un démon qui ne produit pas de sortie significative   | `run_shell_command(is_background=true)`  |

N'ajoutez pas `&` aux commandes monitor. Un `&` final, par exemple `tail -f log &`, est supprimé car le monitor gère lui-même l'exécution en arrière-plan. Un `&` non final, comme `cmd1 & cmd2`, est rejeté ; restructurez ces commandes sans mise en arrière-plan.

## Notes importantes

- **Comportement d'arrêt automatique :** les monitors s'arrêtent automatiquement lorsqu'ils atteignent `max_events`, lorsque `idle_timeout_ms` s'écoule sans sortie, ou lorsque la commande sous-jacente se termine d'elle-même. Le statut d'un monitor reflète le résultat de la commande, pas une erreur d'outil : une sortie propre (code 0) devient `completed`, un code de sortie non nul devient `failed` avec le message `Exit code N`, et une terminaison par signal devient `failed` avec le message `Killed by signal SIG`. Les commandes ne peuvent pas être interactives car stdin est fermé. Lorsqu'un monitor s'arrête, Qwen Code envoie `SIGTERM` au groupe de processus de la commande et passe à `SIGKILL` après environ 200 ms. Sous Windows, il utilise `taskkill /f /t`. Si le processus Qwen Code lui-même est tué brutalement, plante ou manque de mémoire, le groupe de processus détaché n'est pas nettoyé automatiquement ; récupérez-le en arrêtant le monitor avec `task_stop` avant de quitter ou en terminant le groupe de processus manuellement.
- **Limite de concurrence :** Qwen Code autorise jusqu'à 16 monitors en cours par session CLI, sous forme d'un seul pool partagé. Les monitors démarrés par des sous-agents comptent dans le même plafond que ceux démarrés par l'agent principal. Arrêtez un monitor existant avant d'en lancer un autre si la limite est atteinte.
- **Gestion de la sortie :** stdout et stderr sont fusionnés en un seul flux de notifications sans préfixe de flux. Les lignes vides sont ignorées, les caractères ANSI de couleur et de contrôle sont supprimés, et les lignes individuelles de plus de 2000 caractères sont tronquées. La sortie à volume élevé est limitée en débit avec une salve de 5 événements et environ 1 événement par seconde ensuite ; les lignes au-delà de la limite sont abandonnées, pas mises en mémoire tampon. La sortie du monitor arrive dans le contexte de l'agent sous forme de contenu `<task-notification>`. Les balises structurelles de notification sont désactivées, mais le modèle lit toujours le texte de chaque ligne, évitez donc de surveiller des flux auxquels des parties externes peuvent écrire, à moins que vous ne fassiez confiance au modèle pour ignorer les instructions intégrées.
- **Permissions :** `monitor` a sa propre limite de permissions et ses propres règles de permission, comme `Monitor(git status)`. Les commandes en lecture seule sont automatiquement autorisées ; les commandes qui modifient l'état nécessitent l'approbation de l'utilisateur ; les commandes contenant de la substitution de commande (`$(...)`, backticks, `<(...)>` ou `>(...)>)` sont rejetées d'office. Les paramètres `tools.core` et `tools.exclude` pour `run_shell_command` ne s'appliquent pas à `monitor`.
- **Restriction d'espace de travail :** le paramètre facultatif `directory` doit être un chemin absolu qui résout dans un répertoire d'espace de travail enregistré et en dehors du répertoire des compétences utilisateur. Les liens symboliques pointant hors de l'espace de travail sont rejetés.