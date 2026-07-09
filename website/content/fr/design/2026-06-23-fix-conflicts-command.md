# Conception de la commande Resolve

## Objectif

Ajouter une commande `@qwen-code /resolve` déclenchée par un mainteneur pour les pull requests bloquées par des conflits de fusion avec la branche par défaut.

## Périmètre

La première version est volontairement conservatrice :

- La commande s'exécute uniquement dans `QwenLM/qwen-code`.
- Le demandeur doit avoir les permissions `write`, `maintain` ou `admin`.
- La cible doit être une pull request ouverte.
- La branche de la pull request doit se trouver dans le dépôt de base.
- Les pull requests provenant de forks sont signalées comme non prises en charge au lieu d'être pushées.
- L'agent ne reçoit aucun token GitHub. Il peut uniquement modifier et commiter localement.
- Une étape de publication distincte injecte `CI_DEV_BOT_PAT` pour pusher et commenter.

## Workflow

1. Le workflow de commande PR existant gère `issue_comment` ou `workflow_dispatch` et résout la pull request cible.
2. Un job d'autorisation vérifie les permissions de collaborateur du demandeur avec `CI_BOT_PAT`.
3. Le job de résolution accuse réception des déclencheurs de commentaires avec une réaction `eyes`.
4. Le job lit les métadonnées de la pull request et rejette les pull requests fermées, en brouillon, sans conflit ou provenant d'un fork.
5. Pour les pull requests éligibles, le job effectue un checkout de la branche de la pull request avec les identifiants persistants désactivés, exécute un fetch de la branche de base, et vérifie que la branche pointe toujours vers le SHA head attendu.
6. Qwen Code s'exécute sans identifiants GitHub, fusionne `origin/<base>`, résout les conflits, vérifie le résultat, effectue un commit, et génère un artifact de résumé.
7. Une étape de vérification déterministe échoue en cas de conflits non résolus, de résumé manquant ou de checks échoués.
8. L'étape de publication effectue un push avec `--force-with-lease` sur le SHA head original et ajoute un commentaire contenant le résumé de la résolution des conflits.

## Hors périmètre

- Push automatique vers les pull requests provenant de forks.
- Création de pull requests de remplacement pour les contributeurs externes.
- Analyse planifiée des pull requests obsolètes en conflit.
- Résolution des états de non-fusionnabilité autres que les conflits de fusion directs.