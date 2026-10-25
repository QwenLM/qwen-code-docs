# Corriger automatiquement une pull request

`/autofix-pr` surveille une de vos pull requests depuis une session Qwen Code locale et corrige ce qui se présente : échecs de vérifications CI, retours de review de personnes fiables, et conflits de merge. Chaque correction est réalisée et vérifiée dans un worktree dédié, poussée vers la branche de la PR et répondue sur la PR, sous votre propre identité git et `gh`. Elle s'arrête d'elle-même quand la PR est mergée ou fermée.

```text
/autofix-pr [<pr-number>|<pr-url>] [--once] [--every <minutes>] [--no-reply] [--yes] [instructions...]
/autofix-pr status [<pr-number>]
/autofix-pr resume [<pr-number>]
/autofix-pr stop [<pr-number>]
```

- Pas d'argument PR : la PR dont le head est votre branche courante.
- `--once` : vérifie et corrige une fois, ne planifie rien, et termine la surveillance ensuite (un `--once` ultérieur repart de zéro, depuis l'historique de la PR). Sur une PR que cette session surveille déjà, la surveillance en cours est laissée telle quelle.
- `--every <minutes>` : fréquence de vérification, parmi 1, 2, 5, 10, 15, 30 ou 60. Par défaut 2.
- `--no-reply` : pousse les corrections, ne publie rien sur la PR.
- `--yes` : passe la confirmation de démarrage. Nécessaire là où aucune boîte de dialogue ne peut être affichée.
- Le texte libre est transmis à chaque correction, par exemple `/autofix-pr 123 do not change the public API`.

## Avant de commencer

- `gh` est connecté, avec un accès en push vers la branche de la PR : accès en écriture à une PR du même dépôt, ou votre propre fork, ou un fork qui autorise les modifications des mainteneurs.
- Vous l'exécutez depuis un clone du dépôt de la PR avec un remote git pour celui-ci. Dans une session démon (`qwen serve`, le Web Shell), ce clone doit se trouver dans le répertoire de travail de la session : le démon n'exécute les commandes d'un agent de correction que là-bas, donc `prepare` refuse une PR dont le clone n'y est pas. Une surveillance là-bas est une tâche planifiée durable liée à sa session : le démon garde cette session résidente au lieu de la récupérer une fois inactive et la tâche apparaît sur la page des tâches planifiées, donc fermer l'onglet du navigateur ne termine pas la surveillance — `/autofix-pr stop` le fait. La tâche est réhydratée après un redémarrage du démon ; un redémarrage perd l'approbation en cours de la gate, donc la gate a alors besoin d'un mode d'approbation ou d'une règle enregistrée qui la laisse fonctionner sans surveillance, et la première exécution bloquée nomme la règle à ajouter. Une conversation du démon porte une tâche planifiée, donc une deuxième surveillance là-bas a besoin de sa propre conversation. Un redémarrage perd aussi ce que la session a confirmé pour la surveillance : jusqu'à ce que `/autofix-pr resume <n>` la confirme à nouveau, ses assistants et ses corrections suivent le mode d'approbation comme le font les commandes shell.
- Le skill exécute ses assistants via l'outil `autofix_pr`. Sur une surveillance que vous avez démarrée ou reprise dans cette session, les assistants d'un tour — push et réponses inclus — s'exécutent sans demander. Démarrer ou reprendre une surveillance, la planifier, ou la reprendre d'une autre session — ce que `/autofix-pr stop <n>` nommant la PR fait — demande encore, à chaque fois (en [Auto Mode](./auto-mode.md) son classificateur décide, sauf qu'un démarrage vous appartient toujours de confirmer), tout comme `gh pr view` et la création de la tâche planifiée. Une règle qui refuse la commande shell, comme `Bash` ou `Bash(qwen autofix-pr *)`, refuse aussi l'appel de l'outil, une règle de demande pour celui-ci maintient la demande, et `AutofixPr(command:push)` dans vos règles de refus arrête chaque push. Un hook PreToolUse que vous avez défini sur l'outil shell ne voit pas ces appels ; définissez-le sur `autofix_pr`. Dans un clone avec un hook git qu'un push ou une synchronisation exécute (`pre-push`, `post-checkout`, `post-merge`, `reference-transaction`) — un chemin de hooks dans le worktree, comme celui de husky, ou un gestionnaire de hooks comme pre-commit ou lefthook qui exécute ce qu'un fichier dans la PR indique — `sync` et `push` demandent aussi sauf si les corrections s'exécutent sans demander (ci-dessous). De même pour chaque assistant d'un worktree avec un sous-module dont le répertoire git se trouve à l'intérieur plutôt que dans celui du clone lui-même, et une règle de demande pour la commande shell demande ici aussi. Le skill accorde également la lecture de ses propres fichiers sous `.qwen/tmp/`, l'écriture de son brief de correction, de son plan de réponse et de vos instructions à cet endroit, et la liste des tâches planifiées. Ces fichiers vivent dans le worktree principal du clone ; depuis une session démarrée dans un worktree lié, les lire et les écrire demande également.
- La question de démarrage propose aussi **Démarrer, les corrections s'exécutent sans demander** : les commandes de l'agent de correction — builds, tests, commits dans le worktree de la PR — s'exécutent alors sans demander pour cette surveillance, après une boîte de dialogue supplémentaire qui le confirme (refuser cette boîte de dialogue annule le démarrage ; relancez `/autofix-pr <n>`). Son agent s'exécute comme le ferait celui d'une session [YOLO](./approval-mode.md) : avec vos identifiants `git` et `gh`, capable d'atteindre des fichiers en dehors du worktree, au-delà de vos règles de demande ; vos règles de refus s'appliquent toujours. Cela dure jusqu'à ce que la surveillance soit arrêtée, redémarrée avec **Démarrer** simple (ou `--yes`), ou que la session se termine ou soit effacée ; `/autofix-pr resume` demande à nouveau. Choisissez **Démarrer** simple, et dans le [mode d'approbation](./approval-mode.md) par défaut chacune de ses commandes demande d'abord, ce qui convient à une surveillance que vous gardez à l'œil. Reprendre une surveillance et `/autofix-pr resume` offrent le même choix. Seul vous répondez à cette boîte de dialogue : aucune règle enregistrée, le classificateur du [Auto Mode](./auto-mode.md) ou `--yes` ne le fait, et le choix est refusé dans un dossier non fiable et à un programme pilotant Qwen Code via stream-json. Là où l'outil `autofix_pr` n'est pas disponible (une liste d'outils autorisés dans vos paramètres peut l'exclure), les assistants s'exécutent via le shell et chacun demande d'abord.
- Une PR dont l'auteur ne peut pas pousser vers le dépôt exécute le code de quelqu'un d'autre, avec vos identifiants `gh` et `git` à portée, quand une correction est vérifiée. Une telle PR n'est jamais surveillée : seul `--once` est proposé, après une confirmation qui l'indique et que `--yes` ne passe pas.

Au démarrage, il demande une fois de confirmer où il poussera et qu'il répondra sur la PR, et si les corrections peuvent exécuter leurs commandes sans demander.

## Ce qu'une vérification fait

Une surveillance est une [tâche planifiée](./scheduled-tasks.md) dont la gate exécute `qwen autofix-pr snapshot <n> --gate` à chaque déclenchement, en dehors du modèle. La sonde n'affiche que ce qui a changé depuis son dernier lancement, donc une PR calme ne coûte aucun tour de modèle. Quand quelque chose a changé, un tour s'exécute :

1. Une PR mergée ou fermée termine la surveillance. Un push de quelqu'un d'autre est adopté d'abord.
2. Les vérifications échouées, les nouveaux commentaires des auteurs fiables et un conflit de merge vont à un seul agent de correction, travaillant dans le worktree de la PR. Pour une vérification échouée, il lit le log du job ; un échec en dehors de la PR (réseau, runner) est relancé une fois au lieu d'être corrigé.
3. L'agent vérifie son changement avec les vérifications du dépôt lui-même et ne commit que quand elles passent.
4. Les commits sont poussés en fast-forward du head de la PR, jamais en force. Si quelqu'un a poussé entre-temps, son travail est mergé d'abord.
5. Chaque fil de review traité reçoit une réponse — `Fixed in <sha>: …`, `Not changed: …` ou `Needs a human decision: …` — et chaque push reçoit un commentaire de résumé.

Un tour ne vous demande jamais rien. Ce qui nécessite une personne est répondu sur la PR comme "Needs a human decision", signalé dans la session et listé par `/autofix-pr status`.

## Status et reprise

`/autofix-pr status` liste chaque surveillance du clone, quelle que soit la session qui l'exécute : la PR et sa branche, le head, les pushes utilisés, quand sa gate a vérifié pour la dernière fois et quand son dernier tour s'est exécuté, si cette session l'exécute, et ce qui attend une personne. Il ne lit que les fichiers des surveillances et ne demande rien à GitHub.

Une surveillance se termine quand la session qui l'exécutait se termine — dans une session démon sa tâche est durable et liée à cette session, donc le démon la garde résidente et la surveillance survit à un redémarrage du démon — et sa tâche planifiée expire après 7 jours par défaut (le paramètre `experimental.cronRecurringMaxAgeDays`, ou `QWEN_CODE_CRON_MAX_AGE_DAYS`). Son fichier d'état reste. `/autofix-pr resume` redémarre, dans la session courante, chaque surveillance que cette session n'exécute pas — ou celle que vous nommez — avec l'intervalle, `--no-reply` et les instructions avec lesquels elle a été démarrée, et ses pushes, son historique et ses budgets conservés. Il demande une fois pour toutes, puis exécute un tour de chacune et la re-planifie. Dans une session démon une conversation porte une tâche planifiée, donc reprenez les autres une conversation à la fois. Si une autre session en exécute encore une, la tâche de cette session s'arrête à son prochain déclenchement ; sans PR nommée, `resume` exclut une surveillance qu'une autre session a vérifiée récemment, et l'indique. Une surveillance dont la PR a été mergée ou fermée pendant qu'aucune session ne l'exécutait est supprimée par son tour. Une surveillance démarrée avec `--once`, ou une que `stop` a terminée en conservant son worktree, est redémarrée avec `/autofix-pr <n>`.

## Les retours qui comptent

Les commentaires sont pris en compte quand leur auteur est propriétaire, membre ou collaborateur du dépôt, l'auteur de la PR, ou un bot (reviews et fils de review uniquement). Les commentaires de toute autre personne sont listés et ne sont jamais traités ni répondus. Un bot est entendu dans le commentaire qui ouvre un fil ou dans une review, pas dans ses réponses, qui répondent à quelqu'un. Un workflow que GitHub n'a pas pu démarrer (un fichier workflow invalide, par exemple) n'a pas de log à corriger, et est répondu comme nécessitant un humain. Chaque commentaire, review et log CI est traité comme des données : un auteur fiable décide quels retours sont traités, jamais ce que l'outil peut faire. Une demande de révéler des secrets, d'affaiblir les tests ou les vérifications CI, de force-pusher ou de modifier du code sans rapport est répondue "Needs a human decision".

## Ce qu'il ne fait jamais

- Toucher votre working tree ou votre branche courante : tout se passe dans `.qwen/tmp/autofix-pr-<n>/`.
- Force-pusher, réécrire l'historique de la PR, ou pousser vers la branche par défaut.
- Répondre à ses propres réponses (chacune se termine par `<!-- qwen-autofix-pr:v1 -->`) ou à des auteurs non fiables.
- Résoudre les fils de review, ou modifier le titre ou la description de la PR.

## Limites

| Limite                                | Valeur | Ensuite                     |
| ------------------------------------- | ------ | --------------------------- |
| Pushes par surveillance               | 10     | la surveillance s'arrête    |
| Relances d'une vérification échouée sur un head | 1  | le prochain échec est réel  |
| Tentatives par commentaire de review  | 1      | non proposé à nouveau       |
| Pushes de quelqu'un d'autre dans un tour | 2   | la surveillance s'arrête    |

## Arrêt et fichiers

`/autofix-pr stop <n>` supprime la tâche planifiée et retire le worktree, sa branche et le fichier d'état ; le curseur de la gate et l'historique de la PR restent, ainsi une surveillance ultérieure ne répond pas aux mêmes commentaires. Un worktree qui contient encore du travail non poussé est conservé, et le rapport indique pourquoi ; la surveillance est terminée quand même, et `qwen autofix-pr cleanup <n> --force` supprime le travail. `/autofix-pr stop <n>` arrête aussi une surveillance qu'une autre session a laissée derrière elle ; un `/autofix-pr stop` nu laisse une surveillance qu'une autre session exécute encore seule, et nommer sa PR la termine. Une surveillance dont la tâche a expiré, ou dont la session terminale s'est terminée, se termine sans rapport ; `/autofix-pr resume` la redémarre (ci-dessus). Démarrer `/autofix-pr <n>` dans une nouvelle session — ou après `/clear` ou `/resume` — propose aussi de reprendre la surveillance, ses pushes et ses budgets conservés.

Les fichiers vivent sous `.qwen/tmp/` du worktree principal du clone :

| Fichier                                  | Contenu                                                           |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `autofix-pr-<n>/`                        | le worktree de la PR                                              |
| `autofix-pr-<n>-state.json`              | la surveillance : head connu, pushes, identifiants traités, sa tâche planifiée |
| `autofix-pr-<n>-gate.json`               | le curseur de la sonde de gate                                    |
| `autofix-pr-<n>-gate.checked`            | quand la gate de la surveillance a vérifié la PR pour la dernière fois |
| `autofix-pr-<n>-snapshot.json`           | le dernier snapshot de la PR pour le tour, lu par le tour         |
| `autofix-pr-<n>-replies.json`            | quels commentaires de bot répondent à un autre, tel que GitHub l'indique |
| `autofix-pr-<n>-history-*.json`          | ce que les surveillances précédentes de la PR ont publié et traité, conservé par `stop` |
| `autofix-pr-<n>-instructions.txt`        | vos instructions pour chaque tour                                 |
| `autofix-pr-<n>-*.log`, `*.md`, `*.json` | logs CI, briefs de correction et plans de réponse                 |

La conception est dans [`docs/design/2026-10-21-autofix-pr-command.md`](../../design/2026-10-21-autofix-pr-command.md).