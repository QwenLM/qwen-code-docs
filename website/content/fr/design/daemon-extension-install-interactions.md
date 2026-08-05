# Interactions d'installation d'extensions du démon

## Contexte

Le démon installe les extensions en tant qu'opérations de workspace
asynchrones. Certaines extensions nécessitent que l'utilisateur sélectionne un
plugin de marketplace Claude ou fournisse des valeurs de configuration pendant
que l'installation est en cours.

## Design

Une opération d'extension peut entrer dans `waiting_for_input`. Son statut
expose une interaction non sensible à la fois :

- `marketplace_plugin` inclut le nom du marketplace et les plugins
  sélectionnables.
- `setting` inclut le nom du paramètre, sa description, sa variable
  d'environnement, et si la valeur est sensible ou non.

Le client interroge par polling l'endpoint de statut d'opération existant,
puis soumet la réponse à
`POST /workspace/extensions/operations/:operationId/interactions/:interactionId`.
Le callback en mémoire de l'opération reprend après validation de la réponse.

Les valeurs de paramètres ne sont jamais incluses dans le statut des
opérations, les résultats ou les logs. Le mécanisme existant de paramètres
d'extensions reste responsable de leur stockage.

## Durée de vie

Les opérations d'installation et de mise à jour partagent une durée de vie de
vingt minutes. Chaque interaction peut utiliser jusqu'à dix minutes de la
durée de vie restante de l'opération. Les autres mutations d'extensions
conservent leur timeout existant. Une opération en attente reste dans la file
sérialisée existante des mutations, de sorte qu'aucune autre mutation
d'extension ne peut observer un état partiellement installé.
