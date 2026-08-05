# Slash commands non bloquants pendant le streaming

## Problème

Le routeur d'entrée interactif met actuellement en file d'attente chaque
slash command sauf `/btw` pendant qu'une réponse du modèle streame. Cela fait
attendre les contrôles locaux de l'UI jusqu'à la fin du tour de conversation
actif même lorsque leur résultat ne dépend pas de ce tour.

## Design

`SlashCommand` gagne une capacité opt-in `canRunDuringStreaming`. La valeur
par défaut reste false. Pendant que le modèle principal répond, le routeur
d'entrée résout la commande soumise via l'arbre de slash commands existant.
Une commande opt-in est envoyée directement au processeur de slash commands ;
tous les autres slash commands continuent d'utiliser la file d'attente de
messages sérialisée existante.

Le chemin direct ne passe pas par `submitQuery`. Cette fonction possède le
cycle de vie du tour de modèle et rejette délibérément les tours de premier
niveau concurrents. Garder les commandes locales en dehors d'elle évite de
partager les contrôleurs d'annulation, les drapeaux de soumission ou les
compteurs de stream du modèle avec la réponse active.

Le processeur de slash commands et les résultats de commande mettent déjà à
jour Ink via l'état React. Les commandes initiales n'écrivent donc pas
directement sur le stdout du terminal pendant qu'Ink affiche.

## Jeu de commandes initial

- `/status`, `/about` et `/status paths` : lisent des informations locales
  du runtime et ajoutent un élément d'historique Ink.
- `/settings` : ouvre la boîte de dialogue des settings ; les changements
  enregistrés s'appliquent via les hooks de settings existants sans
  remplacer le tour de conversation actif.
- `/help` : ouvre la boîte d'aide statique.

Les catégories suivantes restent sérialisées :

- Les commandes qui soumettent ou transforment un tour de modèle, comme les
  skills, `/summary`, `/compress`, `/model <model> <prompt>` et `/goal`.
- Les commandes qui remplacent, effacent, rewind, reprennent, branchent ou
  mutent d'une autre manière l'état de la conversation.
- Les commandes qui planifient des outils ou effectuent un travail externe de
  longue durée.
- Les commandes qui lisent un état en cours de mutation par le tour actif,
  comme `/context`, `/stats`, `/copy`, `/diff` et `/recap`.

`/btw` conserve son chemin spécialisé de requête au modèle concurrente.
`/quit` conserve son chemin existant d'annulation immédiate. Ctrl+Q continue
de forcer toute soumission à attendre l'inactivité, y compris une commande
autrement opt-in.

## Vérification

La couverture unitaire vérifie que les commandes opt-in contournent à la fois
`submitQuery` et la file d'attente de messages pendant une réponse, tandis
que les slash commands non marqués restent en file d'attente. Les tests de
commande fixent les déclarations de capacité initiales. Les vérifications E2E
interactives doivent démarrer une réponse visiblement en streaming, ouvrir
chaque commande opt-in, fermer toute boîte de dialogue et confirmer que la
réponse d'origine continue et se termine.
