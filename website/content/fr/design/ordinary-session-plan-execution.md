# Exécution du plan des sessions ordinaires

## Objectif

Afficher le plan Todo d'une session ordinaire comme un graphe de dépendances
et relier chaque nœud aux exécutions Agent qui l'implémentent. Réutiliser le
stream de plan ACP existant, le snapshot de tâches de session et la session
de détail des sous-agents.

Cette fonctionnalité est observationnelle. Elle ne planifie, ne retente, ne
débloque ni ne termine le travail.

## Contrat de données

`todo_write` accepte des ID Todo `blockedBy` optionnels. Le runtime valide
que les ID sont uniques, que les références existent, que les dépendances ne
sont ni dupliquées ni auto-référentes et que le graphe est acyclique.

Le sidecar Todo stocke un `planId` généré par le runtime avec le snapshot
courant. L'ID reste stable tant qu'un plan actif est révisé. Effacer un plan,
ou démarrer un travail non vide après que le plan précédent s'est terminé,
démarre un nouveau plan.

Les affichages de résultat Todo portent le `planId`, afin que la projection
ACP live et le chemin de relecture de transcription ordinaire préservent les
mêmes métadonnées de plan :

- plan update `_meta.qwenTodoPlan.id` : identité stable du plan
- plan update `_meta.qwenTranscript.planToolCallId` : appel d'outil Todo
  source
- entrée de plan `_meta.qwenTodo.id` : ID Todo d'origine
- entrée de plan `_meta.qwenTodo.blockedBy` : ID de dépendances lorsqu'ils
  sont présents

Les clients qui ignorent `_meta` continuent de recevoir les entrées de plan
ACP standard.

L'outil Agent accepte un `todo_id` optionnel. C'est une indication, pas une
porte du runtime : les appels Agent de premier niveau doivent le fournir
lorsqu'un graphe Todo actif existe. L'`AgentTask.toolUseId` existant joint
l'appel d'outil Agent au statut live de la tâche, donc l'API de tâche n'a
besoin d'aucun champ supplémentaire.

## Flux UI

La pastille Todo active continue d'afficher la liste compacte existante.
Cliquer dessus ouvre la boîte de dialogue Tasks existante. Lorsque les
métadonnées de plan sont présentes, cette boîte ajoute une section CSS native
d'exécution du plan au-dessus de l'arbre de tâches existant :

1. Disposer les nœuds en couches topologiques à partir de `blockedBy`.
2. Regrouper les appels d'outil Agent de premier niveau par `args.todo_id`.
3. Joindre les lignes de tâches live via
   `task.toolUseId === tool.callId`.
4. Garder les lignes Agent imbriquées sous la racine via `parentAgentId`.
5. Sélectionner un nœud de workflow pour inspecter son contenu Todo complet,
   son statut, ses dépendances et les exécutions Agent liées sous le graphe.
6. Ouvrir le panneau live existant de détail du sous-agent depuis une
   exécution Agent liée ; il reste la source pour la progression streamée,
   les appels d'outil et la sortie finale.
7. Placer les liaisons `todo_id` manquantes ou inconnues dans un groupe
   Unassigned.

Aucune bibliothèque de graphes n'est ajoutée. Les plans sans métadonnées de
dépendances conservent la présentation en liste.

## Approbation du Plan Mode

Le Plan Mode est la porte d'exécution opt-in pour les utilisateurs qui
veulent revoir un workflow avant que le travail ne commence. Lorsque
`exit_plan_mode` demande la permission, Web Shell affiche le corps de plan
ACP faisant autorité suivi du workflow Todo actif dans le panneau
d'approbation existant. La vue Todo est complémentaire car son snapshot peut
différer du texte de plan soumis. Un workflow conscient des dépendances est
affiché comme le même DAG utilisé par la boîte de dialogue Tasks ; un
workflow sans dépendances conserve la présentation en liste.

Le cycle de vie des permissions existant reste faisant autorité : approuver
quitte le Plan Mode et démarre l'exécution, tandis que rejeter garde la
session en Plan Mode. S'il n'y a pas de snapshot Todo actif, l'approbation
conserve sa présentation existante en texte seul utilisant le corps de plan
transporté par ACP. Les sessions qui n'entrent pas en Plan Mode sont
inchangées.

## Composition du statut

Le statut Todo reste la source de vérité métier. L'état Agent est une couche
d'exécution :

1. Une exécution liée en cours d'exécution : Running
2. Sinon, une exécution liée en pause : Paused
3. Todo terminé : Completed
4. Un Todo de dépendance incomplet : Blocked
5. Todo en cours : In progress
6. Sinon : Ready

Une exécution échouée ou annulée ajoute un badge Needs attention sans changer
le statut Todo.

## Compatibilité et limites

- Les anciens snapshots Todo sans ID ni dépendances restent lisibles.
- Les appels Agent sans `todo_id` restent valides.
- Les snapshots Todo vides doivent effacer l'état actif immédiatement.
- Les résultats complets des sous-agents restent hors de la réponse de
  polling des tâches de trois secondes.
- Les nœuds Todo n'inventent pas de sortie d'étape ; le détail d'exécution
  provient des appels d'outil Agent liés et de la session de détail des
  sous-agents existante.
- L'application stricte du plan d'abord pour chaque session reste hors du
  périmètre car une vérification d'existence au niveau session pourrait
  accepter un plan obsolète.
