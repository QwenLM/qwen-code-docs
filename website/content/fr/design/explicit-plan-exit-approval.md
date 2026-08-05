# Approbation explicite de sortie du mode plan

## Problème

`exit_plan_mode` mélangeait auparavant l'approbation et l'exécution. Son
callback de confirmation changeait l'`ApprovalMode` avant la fin des hooks
et de l'exécution, et les sessions AUTO/YOLO pouvaient contourner
l'utilisateur via une porte d'approbation de plan LLM. Les règles
d'autorisation du permission-manager, les hooks de permission et
l'auto-approbation par des frères pouvaient aussi satisfaire une décision
`ask` sans véritable réponse de l'hôte ou de l'utilisateur. Cela rendait un
appel d'outil issu du modèle capable de tenter de quitter le mode plan sans
décision de l'utilisateur et créait des notifications de mode trompeuses
lorsque l'exécution ultérieure échouait.

## Design

Les invocations d'outil peuvent déclarer `requiresUserInteraction()`. C'est
une exigence d'interaction intrinsèque, pas un autre niveau de permission :
les refus intrinsèques ou du permission-manager gagnent toujours, tandis que
les règles d'autorisation et les modes d'approbation automatiques ne
peuvent pas la satisfaire. `exit_plan_mode` de la session principale déclare
cette exigence. Les coéquipiers exigeant un plan conservent leur chemin
d'approbation par le leader, et les sous-agents ordinaires conservent le
rejet existant de l'outil de cycle de vie.

Le callback de confirmation du plan n'enregistre qu'une des quatre
décisions : restaurer le mode pré-plan, passer en auto-edit, passer en
défaut ou annuler. Il ne change jamais le mode. Créer la confirmation fige
le texte du plan, le mode pré-plan et la révision courante du mode
d'approbation. `execute()` vérifie que l'approbation existe, que le signal
est actif, que la session est toujours en mode plan et que la révision
correspond toujours avant d'appliquer la transition de mode de manière
synchrone. Cela fait échouer en fail closed les sorties obsolètes,
réentrantes et concurrentes. La persistance du plan n'a lieu que de manière
best-effort après la réussite de la transition.

`Config` possède une révision monotone du mode d'approbation qui ne
s'incrémente que lorsque le mode change réellement. Les remplacements du
mode d'approbation possèdent des révisions indépendantes. L'argument
optionnel existant du setter `enteredByModel` reste temporairement comme
paramètre de compatibilité ignoré ; l'origine modèle n'a aucun effet sur
l'approbation.

La porte d'approbation de plan LLM et son couplage aux métadonnées
AskUserQuestion sont supprimés. `prePlanMode` reste car c'est un choix de
sortie visible par l'utilisateur. `originalRequest` et `researchSummary`
restent pour la revue par le leader des coéquipiers exigeant un plan.
`resolutionSummary` reste uniquement comme propriété d'entrée TypeScript
obsolète pour la compatibilité du code source et n'est plus acceptée par le
schéma runtime.

## Comportement de l'hôte

Les confirmations du CLI et de l'IDE, `requestPermission` d'ACP et les
réponses d'autorisation `can_use_tool` de stream-json comptent comme une
interaction explicite. Les hooks d'autorisation PermissionRequest, les
règles d'autorisation du PM, YOLO/AUTO/AUTO_EDIT et l'auto-approbation par
des frères ne comptent pas comme telles. Les décisions de refus des hooks
restent faisant autorité. Les appelants non interactifs sans hôte capable
d'approuver échouent en fail closed.

ACP n'envoie aucune mise à jour de mode lorsqu'une permission est en
attente ou lorsque la confirmation, les hooks, l'exécution ou la transition
échouent. Après une exécution réussie du cycle de vie du plan et un vrai
changement de mode, il envoie une mise à jour utilisant le mode lu depuis
`Config`. L'échec de notification legacy est consultatif et le canal
latéral de l'extension est quand même tenté avec une valeur
`legacyFrameSent` exacte.

## Comportement en cas d'échec

- Les appels hors du mode plan échouent en toute sécurité avec un guidage
  d'état exploitable à la frontière qui observe le changement de mode.
  `execute()` renvoie une erreur de guidage lorsque la session est hors du
  mode plan et qu'il n'y a pas de snapshot d'approbation.
  `getConfirmationDetails()` lève le même guidage lorsqu'il est appelé hors
  du mode plan (par exemple via une règle `ask` du PM ou un passage de plan
  à non-plan entre l'évaluation de permission et la construction de
  confirmation). La permission par défaut est `allow` — c'est un problème
  d'état, pas un problème de sécurité.
- Les résultats de confirmation invalides, l'annulation, les abandons, les
  révisions obsolètes et les échecs de transition laissent le mode plan
  actif.
- Deux sorties approuvées contre la même révision ne peuvent pas réussir
  toutes les deux.
- Si un hôte ACP ne peut pas présenter `switch_mode`, le mode plan reste
  actif et l'erreur dirige l'utilisateur vers le sélecteur de mode de
  l'hôte ou `/plan exit`.
- Sauvegarder un plan déjà approuvé est best-effort et ne fait pas de
  rollback d'une transition de mode réussie.

## Compatibilité et périmètre

Ce changement n'élargit intentionnellement pas l'exécution shell générale
en mode plan et n'ajoute pas d'outils de lecture spécifiques à DataWorks.
Ce sont des changements de permissions/outillage séparés. La méthode
d'invocation publique est optionnelle avec `false` par défaut, de sorte que
les outils existants et les implémentations externes restent compatibles.
