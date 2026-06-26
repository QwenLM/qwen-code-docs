# Outil Monitor (`monitor`)

Ce document décrit l'outil `monitor` pour Qwen Code.

## Description

Utilisez `monitor` pour lancer une commande shell longue qui diffuse les lignes
stdout et stderr vers l'agent sous forme de notifications de tâche en arrière‑plan.
Il est conçu pour les commandes de type `watch` où les nouvelles sorties ont de
l'importance dans le temps, comme suivre des logs, surveiller la sortie d'une
compilation, interroger un point de terminaison de santé ou observer des
modifications de fichiers.

Le moniteur s'exécute en arrière‑plan, ce qui permet à l'agent de continuer à
travailler pendant que les événements arrivent. Chaque ligne de sortie non vide
devient un événement de notification, soumis à une limitation de débit.

### Arguments

`monitor` prend les arguments suivants :

- `command` (chaîne, obligatoire) : La commande shell à exécuter et à surveiller.
- `description` (chaîne, facultatif) : Une brève description de ce que le
  moniteur surveille. Le texte affiché est tronqué à 80 caractères.
- `max_events` (nombre, facultatif) : Arrêter après ce nombre d'événements de
  notification. Doit être un entier positif. Par défaut `1000` ; maximum `10000`
  (les valeurs en dehors de cette plage sont rejetées, pas silencieusement ramenées).
- `idle_timeout_ms` (nombre, facultatif) : Arrêter si la commande ne produit
  aucune sortie pendant ce nombre de millisecondes. Doit être un entier positif.
  Par défaut `300000` (5 minutes) ; maximum `600000` (10 minutes), et les valeurs
  en dehors de cette plage sont rejetées.
- `directory` (chaîne, facultatif) : Un chemin absolu dans lequel exécuter la
  commande. Doit résoudre (après canonicalisation des liens symboliques) à
  l'intérieur d'un des répertoires de l'espace de travail enregistré, et ne doit
  pas se trouver à l'intérieur du répertoire user‑skills. Si omis, Qwen Code
  utilise la racine du projet.

## Comment utiliser `monitor` avec Qwen Code

Le modèle choisit l'outil `monitor` lorsqu'il doit observer un processus sur la
durée au lieu de collecter un résultat de commande unique. Un appel réussi
renvoie un identifiant de moniteur, la commande, la limite d'événements et le
délai d'inactivité.

Utilisation :

```
monitor(command="tail -f logs/app.log", description="flux de logs applicatifs")
```

La sortie du moniteur est visible dans la conversation sous forme de
notifications de tâche. Vous pouvez aussi inspecter les moniteurs en cours et
terminés avec `/tasks` ou la boîte de dialogue interactive Tâches en arrière‑plan.

Pour arrêter un moniteur en cours, utilisez l'outil `task_stop` avec
l'identifiant du moniteur :

```
task_stop(task_id="mon_abc123def4567890")
```

## Exemples de `monitor`

Surveiller un journal d'application :

```
monitor(
  command="tail -f logs/app.log",
  description="flux de journal applicatif",
  max_events=200
)
```

Surveiller un serveur de développement ou un watcher de compilation :

```
monitor(
  command="npm run build -- --watch",
  description="surveillance de la sortie de compilation",
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

Exécuter depuis un répertoire d'espace de travail spécifique :

```
monitor(
  command="npm run dev",
  description="serveur de développement frontend",
  directory="/absolute/path/to/workspace/packages/web"
)
```

## Monitor vs commandes shell en arrière‑plan

Utilisez `monitor` lorsque l'agent doit réagir à un flux de sortie pendant que
la commande continue de s'exécuter. Utilisez `run_shell_command` à la place
lorsque vous avez besoin d'un résultat ponctuel ou de la sortie complète de la
commande.

| Besoin                                                   | Utilisation                              |
| :------------------------------------------------------- | :--------------------------------------- |
| Suivre des logs, la sortie de compilation ou des mises à jour périodiques | `monitor`                                |
| Exécuter une commande ponctuelle et lire la sortie complète | `run_shell_command(is_background=false)` |
| Lancer un démon qui ne produit pas de sortie pertinente  | `run_shell_command(is_background=true)`  |

N'ajoutez pas `&` aux commandes monitor. Un `&` en fin de commande, comme
`tail -f log &`, est supprimé car le moniteur gère lui‑même l'exécution en
arrière‑plan. Un `&` non final, comme `cmd1 & cmd2`, est rejeté purement et
simplement ; restructurez ces commandes sans mise en arrière‑plan à la place.

## Remarques importantes

- **Comportement d'arrêt automatique :** Les moniteurs s'arrêtent
  automatiquement lorsqu'ils atteignent `max_events`, lorsque `idle_timeout_ms`
  s'écoule sans sortie, ou lorsque la commande sous‑jacente se termine d'elle‑même.
  Le statut d'un moniteur reflète le résultat de la commande, pas une erreur
  d'outil : une sortie normale (code `0`) devient `completed`, un code de sortie
  non nul devient `failed` avec le message `Exit code N`, et une terminaison
  par signal devient `failed` avec le message `Killed by signal SIG`. Les
  commandes ne peuvent pas être interactives car stdin est fermé. Lorsqu'un
  moniteur s'arrête, Qwen Code envoie `SIGTERM` au groupe de processus de la
  commande et passe à `SIGKILL` après environ 200 ms. Sous Windows, il utilise
  `taskkill /f /t`. Si le processus Qwen Code lui‑même est tué brutalement,
  plante ou manque de mémoire, le groupe de processus détaché n'est pas nettoyé
  automatiquement ; récupérez‑le en arrêtant le moniteur avec `task_stop` avant
  de quitter ou en terminant le groupe de processus manuellement.
- **Limite de concurrence :** Qwen Code autorise jusqu'à 16 moniteurs en cours
  d'exécution par session CLI en tant que pool partagé unique. Les moniteurs
  lancés par des sous‑agents comptent dans la même limite que ceux lancés par
  l'agent principal. Arrêtez un moniteur existant avant d'en démarrer un autre
  si la limite est atteinte.
- **Gestion de la sortie :** stdout et stderr sont fusionnés en un seul flux de
  notification sans préfixe de flux. Les lignes vides sont ignorées, les
  caractères de contrôle et de couleur ANSI sont supprimés, et les lignes
  individuelles de plus de 2000 caractères sont tronquées. La sortie à volume
  élevé est limitée en débit avec une rafale de 5 événements et environ
  1 événement par seconde ensuite ; les lignes au‑delà de la limite sont
  abandonnées, pas mises en mémoire tampon. La sortie du moniteur entre dans
  le contexte de l'agent sous forme de contenu `<task-notification>`. Les
  balises de notification structurelles sont désamorcées, mais le modèle lit
  toujours le texte de chaque ligne, évitez donc de surveiller des flux que des
  parties externes peuvent écrire à moins de faire confiance au modèle pour
  ignorer les instructions intégrées.
- **Permissions :** `monitor` a sa propre frontière de permissions et ses
  propres règles de permission, comme `Monitor(git status)`. Les commandes en
  lecture seule sont automatiquement autorisées ; les commandes qui modifient
  l'état nécessitent une approbation utilisateur ; les commandes contenant une
  substitution de commande (`$(...)`, backticks, `<(...)`, ou `>(...)`) sont
  rejetées purement et simplement. Les paramètres `tools.core` et `tools.exclude`
  pour `run_shell_command` ne s'appliquent pas à `monitor`.
- **Restriction d'espace de travail :** Le paramètre facultatif `directory`
  doit être un chemin absolu qui résout à l'intérieur d'un répertoire d'espace
  de travail enregistré et en dehors du répertoire user‑skills. Les liens
  symboliques pointant en dehors de l'espace de travail sont rejetés.
