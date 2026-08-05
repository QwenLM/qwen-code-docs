# Plan et review de session expérimentaux

## Objectif

Rendre opt-in la visualisation du Workflow des sessions ordinaires et
laisser les utilisateurs revoir le graphe de dépendances Todo exact avant
l'exécution. Réutiliser le mode plan, les snapshots de Todo et le cycle de
vie de permission existant.

## Déploiement

`experimental.sessionWorkflow` est désactivé par défaut. Lorsqu'il est
désactivé, le Web Shell conserve la liste Todo et le comportement du mode
plan existants mais ne rend pas le DAG du Workflow ni ne renomme le mode
plan. Le paramètre ne change que la présentation ; il n'enregistre pas
d'outils, ne modifie pas la sémantique des Todos et ne crée pas un autre
mode d'approbation.

Lorsqu'il est activé, le mode `plan` existant est présenté comme **Plan &
Review**. Le mode plan reste la porte d'exécution : l'investigation en
lecture seule est autorisée, les outils de mutation restent bloqués,
rejeter `exit_plan_mode` maintient le mode plan, et approuver quitte le
mode plan.

## Livraison

### Phase 1 : présentation opt-in

- Exposer le paramètre désactivé par défaut via la route existante des
  paramètres de workspace du démon.
- Lire le paramètre effectif depuis le workspace actif du Web Shell et
  l'appliquer de manière cohérente à son chat principal, ses volets divisés
  et ses volets de tâches secondaires.
- Conserver le rendu de la liste Todo inchangé tout en contrôlant les
  entrées du DAG du Workflow.
- Renommer l'entrée Plan existante uniquement lorsque le paramètre est
  activé.

### Phase 2 : approbation liée à la révision

- Dans Plan & Review, exiger un snapshot d'exécution Todo structuré dont
  les nœuds restent en attente avant l'approbation.
- Porter l'identité du plan Todo et l'identité de l'appel d'outil source
  avec la requête d'approbation `exit_plan_mode`.
- Résoudre le DAG d'approbation depuis cette identité au lieu de la
  dernière liste Todo active.
- Réutiliser la lignée d'IDs de plan existante afin que les snapshots et
  les exécutions Agent ultérieurs continuent de mettre à jour le même
  Workflow sans autre magasin.
- Retomber sur l'approbation texte seule existante lorsqu'aucun snapshot
  correspondant n'est disponible.

## Frontières

Le Workflow reste observationnel. Il ne planifie pas les dépendances, ne
retente pas les Agents, ne propage pas la complétion et n'ajoute pas de
magasin de Workflow. `blockedBy` et `todo_id` restent optionnels pour les
sessions hors de Plan & Review.
