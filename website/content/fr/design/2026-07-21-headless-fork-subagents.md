# Sous-agents fork héritant du contexte en mode headless

## Problème

Une requête explicite `subagent_type: "fork"` n'est actuellement honorée que
lorsque `Config.isInteractive()` est vrai. Les appelants headless tels que
`qwen --prompt`, le SDK TypeScript et les runners CI exécutent silencieusement
à la place un nouveau sous-agent `general-purpose`. Les modes de contexte
demandé et effectif diffèrent donc, et l'enfant ne reçoit pas la conversation
du parent.

## Conception

La disponibilité des forks est indépendante de la surface de présentation.
Une requête de fork au premier niveau utilise toujours le chemin de
construction de fork existant, qui copie l'historique du parent et la
configuration de génération sûre pour le cache.

Les forks headless passent par le registre d'agents en arrière-plan existant
même lorsque `run_in_background` est omis ou faux. Les forks sont détachés
par définition, et le registre fournit aux appelants non interactifs le cycle
de vie dont ils ont besoin :

- une exécution headless one-shot attend que le fork se termine ;
- les consommateurs de stream reçoivent `task_started` et les notifications
  terminales de tâche ;
- le `subagent_type: "fork"` effectif est enregistré dans les événements,
  les métadonnées et la télémétrie des sous-agents ;
- les demandes de permission qui ne peuvent pas être affichées dans une
  session non interactive sont refusées par la politique existante des agents
  en arrière-plan au lieu de rester en attente indéfiniment.

Le comportement des forks interactifs reste inchangé.

Une requête de fork depuis un sous-agent imbriqué n'est toujours pas prise en
charge, mais elle échoue désormais avec une erreur d'outil explicite au lieu
d'exécuter silencieusement un nouveau sous-agent `general-purpose`.

## Périmètre

Ce changement réutilise le comportement actuel de fork à historique complet.
Il n'ajoute pas la sélection d'historique partiel telle que `fork_turns` ;
elle peut être introduite séparément sans bloquer l'héritage headless
correct.

## Vérification

- Les tests de dispatch du cœur couvrent les forks interactifs, les forks
  headless, le cycle de vie forcé en arrière-plan, la construction de
  l'historique hérité, le comportement des permissions et le rejet explicite
  des forks imbriqués.
- Le test CLI non interactif couvre l'événement `task_started` destiné au
  SDK et vérifie qu'il expose `subagent_type: "fork"`.
- Le test de l'adaptateur SDK desktop vérifie que le résultat en
  arrière-plan du runtime prend le pas sur un `run_in_background: false`
  fourni par l'appelant.
- Une vérification end-to-end `qwen --prompt --output-format stream-json`
  utilise un marqueur parent absent de la directive de fork et vérifie que
  l'enfant peut toujours le récupérer depuis l'historique hérité.
