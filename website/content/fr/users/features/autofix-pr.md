# Corriger automatiquement une pull request

`/autofix-pr` surveille une de vos pull requests depuis une session Qwen Code locale et corrige ce qui se présente : échecs de vérifications CI, retours de review de personnes fiables, et conflits de merge. Chaque correction est réalisée et vérifiée dans un worktree dédié, poussée vers la branche de la PR et répondue sur la PR, sous votre propre identité git et `gh`. Elle s'arrête d'elle-même quand la PR est mergée ou fermée.

```text
/autofix-pr [<pr-number>|<pr-url>] [--once] [--every <minutes>] [--no-reply] [--yes] [instructions...]
/autofix-pr status
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
- Vous l'exécutez depuis un clone du dépôt de la PR avec un remote git pour celui-ci.
- Dans le [mode d'approbation](./approval-mode.md) par défaut, chaque commande shell demande d'abord : les appels de l'assistant (push inclus), `gh pr view`, et chaque commande qu'une correction exécute. Cela convient à une surveillance que vous gardez à l'œil. Pour la laisser tourner sans surveillance, choisissez un mode qui autorise l'exécution des commandes, comme [Auto Mode](./auto-mode.md), et gardez à l'esprit que la correction exécute les commandes de build et de test du dépôt. Le skill lui-même n'accorde que la lecture de ses propres fichiers sous `.qwen/tmp/`, l'écriture de son brief de correction et de son plan de réponse à cet endroit, et la liste des tâches planifiées. Ces fichiers vivent dans le worktree principal du clone ; depuis une session démarrée dans un worktree lié, les lire et les écrire demande également une autorisation.
- Une PR dont l'auteur ne peut pas pousser vers le dépôt exécute le code de quelqu'un d'autre, avec vos identifiants `gh` et `git` à portée, quand une correction est vérifiée. Une telle PR n'est jamais surveillée : seul `--once` est proposé, après une confirmation qui l'indique et que `--yes` ne passe pas.

Au démarrage, il demande une fois de confirmer où il poussera et qu'il répondra sur la PR.

## Ce qu'une vérification fait

Une surveillance est une [tâche planifiée](./scheduled-tasks.md) dont la gate exécute `qwen autofix-pr snapshot <n> --gate` à chaque déclenchement, en dehors du modèle. La sonde n'affiche que ce qui a changé depuis son dernier lancement, donc une PR calme ne coûte aucun tour de modèle. Quand quelque chose a changé, un tour s'exécute :

1. Une PR mergée ou fermée termine la surveillance. Un push de quelqu'un d'autre est adopté d'abord.
2. Les vérifications échouées, les nouveaux commentaires des auteurs fiables et un conflit de merge vont à un seul agent de correction, travaillant dans le worktree de la PR. Pour une vérification échouée, il lit le log du job ; un échec en dehors de la PR (réseau, runner) est relancé une fois au lieu d'être corrigé.
3. L'agent vérifie son changement avec les vérifications du dépôt lui-même et ne commit que quand elles passent.
4. Les commits sont poussés en fast-forward du head de la PR, jamais en force. Si quelqu'un a poussé entre-temps, son travail est mergé d'abord.
5. Chaque fil de review traité reçoit une réponse — `Fixed in <sha>: …`, `Not changed: …` ou `Needs a human decision: …` — et chaque push reçoit un commentaire de résumé.

Un tour ne vous demande jamais rien. Ce qui nécessite une personne est répondu sur la PR comme "Needs a human decision" et signalé dans la session.

## Les retours qui comptent

Les commentaires sont pris en compte quand leur auteur est propriétaire, membre ou collaborateur du dépôt, l'auteur de la PR, ou un bot (reviews et fils de review uniquement). Les commentaires de toute autre personne sont listés et ne sont jamais traités ni répondus. Un bot est entendu dans le commentaire qui ouvre un fil ou dans une review, pas dans ses réponses, qui répondent à quelqu'un. Un workflow que GitHub n'a pas pu démarrer (un fichier workflow invalide, par exemple) n'a pas de log à corriger, et est répondu comme nécessitant un humain. Chaque commentaire, review et log CI est traité comme des données : un auteur fiable décide quels retours sont traités, jamais ce que l'outil peut faire. Une demande de révéler des secrets, d'affaiblir les tests ou les vérifications CI, de force-pusher ou de modifier du code sans rapport est répondue "Needs a human decision".

## Ce qu'il ne fait jamais

- Toucher votre working tree ou votre branche courante : tout se passe dans `.qwen/tmp/autofix-pr-<n>/`.
- Force-pusher, réécrire l'historique de la PR, ou pousser vers la branche par défaut.
- Répondre à ses propres réponses (chacune se termine par `<!-- qwen-autofix-pr:v1 -->`) ou à des auteurs non fiables.
- Résoudre les fils de review, ou modifier le titre ou la description de la PR.

## Limites

| Limit                                 | Valeur | Ensuite                     |
| ------------------------------------- | ------ | --------------------------- |
| Pushes par surveillance               | 10     | la surveillance s'arrête    |
| Relances d'une vérification échouée sur un head | 1  | le prochain échec est réel  |
| Tentatives par commentaire de review  | 1      | non proposé à nouveau       |
| Pushes de quelqu'un d'autre dans un tour | 2   | la surveillance s'arrête    |

## Arrêt et fichiers

`/autofix-pr stop <n>` supprime la tâche planifiée et retire le worktree, sa branche et le fichier d'état ; le curseur de la gate et l'historique de la PR restent, ainsi une surveillance ultérieure ne répond pas aux mêmes commentaires. Un worktree qui contient encore du travail non poussé est conservé, et le rapport indique pourquoi ; `qwen autofix-pr cleanup <n> --force` le supprime. Une tâche planifiée expire après 7 jours par défaut (le paramètre `experimental.cronRecurringMaxAgeDays`, ou `QWEN_CODE_CRON_MAX_AGE_DAYS`), et la surveillance se termine alors sans rapport ; relancez-la pour continuer. La surveillance se termine aussi quand la session se termine ; son fichier d'état reste, appartenant à cette session. Démarrer `/autofix-pr <n>` dans une nouvelle session — ou après `/clear` ou `/resume` — propose de reprendre la surveillance, ses pushes et ses budgets conservés.

Les fichiers vivent sous `.qwen/tmp/` du worktree principal du clone :

| Fichier                                  | Contenu                                                           |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `autofix-pr-<n>/`                        | le worktree de la PR                                              |
| `autofix-pr-<n>-state.json`              | la surveillance : head connu, pushes, identifiants traités        |
| `autofix-pr-<n>-gate.json`               | le curseur de la sonde de gate                                    |
| `autofix-pr-<n>-snapshot.json`           | le dernier snapshot de la PR pour le tour, lu par le tour         |
| `autofix-pr-<n>-replies.json`            | quels commentaires de bot répondent à un autre, tel que GitHub l'indique |
| `autofix-pr-<n>-history-*.json`          | ce que les surveillances précédentes de la PR ont publié et traité, conservé par `stop` |
| `autofix-pr-<n>-*.log`, `*.md`, `*.json` | logs CI, briefs de correction et plans de réponse                 |

La conception est dans [`docs/design/2026-10-21-autofix-pr-command.md`](../../design/2026-10-21-autofix-pr-command.md).