# Un seul skill Autofix pour les exécutions locales et CI

## Contexte

Qwen Code possède déjà un skill Autofix appartenant au dépôt, utilisé par GitHub Actions.
Il contient le triage des retours de review et les règles de vérification, tandis que le workflow
possède la planification, le filtrage de confiance, les identifiants, les écritures GitHub et les
budgets de tours.

Autofix local doit réutiliser ce skill plutôt que d'ajouter un skill embarqué ou un second
moteur de maintenance. Son entrée est l'arbre de travail courant, pas une pull request distante :
les changements indexés, non indexés et non suivis sont examinés ensemble.

## Conception

Le fichier `.qwen/skills/autofix/SKILL.md` existant reste le seul skill Autofix. Il
a deux chemins d'entrée :

- Une invocation directe de `/autofix` examine et corrige de manière synchrone l'arbre
  de travail courant.
- Le runner Actions existant fournit l'un de `assess-candidates`,
  `develop-issue` ou `address-review` ainsi que des fichiers fiables préparés par le workflow.

Le chemin local exécute de façon répétée la commande de review lisible par machine existante :

```bash
env -u SANDBOX QWEN_SANDBOX=true "${QWEN_CODE_CLI:-qwen}" review run --approval-mode auto --effort high --json --quiet
```

La commande s'exécute comme un shell en arrière-plan géré afin que son propre timeout, plutôt que
la limite plus courte des outils au premier plan, reste l'autorité. Autofix l'attend
néanmoins de manière synchrone : le TUI interactif reprend à partir de la notification de tâche
du terminal, tandis que les sessions ACP, stream-json et headless inspectent le sidecar de statut
à une cadence bornée et croissante. Les empreintes de l'arbre de travail autour de la review
et juste avant la convergence font de tout effet de bord de la review ou de toute modification
concurrente un résultat `BLOCKED` visible.

La review headless imbriquée utilise le mode d'approbation Auto dans la sandbox Qwen.
Autofix efface un marqueur `SANDBOX` hérité avant le démarrage afin qu'il ne puisse pas contourner
le confinement ; un classifieur d'approbation ou une sandbox indisponible produit une review
incomplète et échoue en fail closed. Avant le lancement, Autofix explique que la review
peut exécuter des vérifications définies par le dépôt dans un processus sandboxé qui conserve les
identifiants du modèle et l'accès réseau, puis exige une confirmation explicite que l'utilisateur
fait confiance au dépôt. S'il existe des fichiers non suivis et non ignorés, Autofix les liste
également avant que leur contenu n'entre dans le contexte du modèle de review. Les exécutions
non interactives s'arrêtent sur `BLOCKED` lorsque la confirmation est indisponible. Sous Windows,
Autofix local nécessite Git Bash/MSYS car le workflow de review embarqué utilise la syntaxe shell
POSIX ; cmd.exe natif et PowerShell échouent en fail closed avant le début de la review.

Après chaque review complète, Autofix lit le rapport émis, vérifie chaque constat par rapport au
code, applique un lot de correctifs minimal et cohérent, exécute les vérifications pertinentes les
plus étroites et examine à nouveau l'arbre de travail résultant. Il n'interroge pas GitHub en
polling ni n'utilise `/loop`.

Il n'y a pas de nombre fixe de tours locaux. Le processus s'arrête sur preuve :

- `NO_CHANGES` : l'arbre de travail était propre avant la review.
- `CONVERGED` : une review complète non plafonnée n'a aucun constat exploitable et toutes les
  vérifications requises passent.
- `BLOCKED` : les preuves de la review sont incomplètes, une vérification requise n'a pas de
  correctif sûr dans le périmètre, ou une décision de mainteneur/produit est requise.
- `STALLED` : le même constat exploitable survit sans nouvelle hypothèse, aucun progrès de
  l'arbre de travail n'est réalisé, ou les changements oscillent.

Autofix local n'indexe jamais, ne commit jamais, ne pousse jamais, ne réécrit jamais l'historique,
ne modifie jamais l'index et n'écrit jamais sur GitHub. L'état indexé existant de l'utilisateur
reste intact ; les correctifs sont laissés comme modifications de l'arbre de travail pour
inspection.

## Frontière du workflow

GitHub Actions conserve toute la politique déterministe : déclencheurs, autorisation,
checkout, sélection des retours fiables, budgets de retry et de tours, watermarks,
commits, push, commentaires et gates finales. Seule la politique de décision du modèle
appartient au skill. En particulier, le workflow peut marquer un retour comme différé tandis que
le skill décide comment un agent doit traiter cette section.

## Alternatives rejetées

- Un skill Autofix embarqué entrerait en collision avec le skill du dépôt et scinderait le
  contrat du modèle.
- `on`, `off` ou `status` contrôleraient le workflow distant au lieu de corriger les
  changements locaux.
- Un nouveau watcher, planificateur ou machine à états d'exécution dupliquerait l'infrastructure
  de review et Actions existante.
- Un plafond fixe de tours locaux peut arrêter une réparation qui progresse ; des conditions
  d'arrêt basées sur les progrès bornent les exécutions non convergentes sans imposer un total
  arbitraire.
