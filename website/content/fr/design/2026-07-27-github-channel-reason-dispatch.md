# Dispatch par raison de notification GitHub

## Objectif

Utiliser `notification.reason` pour choisir le prompt envoyé par le canal
GitHub sans modifier son comportement de polling, d'avancée de curseur, de
retry ou de rapport d'erreur.

| Raison              | Comportement                                                        |
| ------------------- | --------------------------------------------------------------- |
| `mention`           | Envoyer uniquement le contenu qui mentionne réellement le bot.               |
| `review_requested`  | Pour les pull requests, envoyer un prompt de revue avec les données de la pull request. |
| `assign`            | Envoyer un prompt de triage avec les données de l'issue.                           |
| `author`, `comment` | Agréger les nouveaux commentaires de la fenêtre en un seul prompt de suivi.  |
| Autre               | Conserver le traitement par commentaire et identifier la raison de la notification. |

Les événements de revue et d'assignation utilisent l'acteur de l'événement
GitHub comme expéditeur de l'enveloppe afin que les vérifications existantes
de politique d'expéditeur contrôlent la personne qui a initié l'action, et non
l'auteur de l'issue ou de la pull request. L'agrégation n'inclut que les
expéditeurs autorisés et est limitée aux 20 derniers commentaires et à 400
caractères par commentaire. La politique d'appariement conserve le dispatch
par commentaire afin que chaque expéditeur soit autorisé indépendamment.

Le curseur mémorise jusqu'à 500 ID de nœuds de commentaires et d'événements
directs dispatchés. Un plancher fixe au moment de l'installation permet aux
notifications de revue et d'assignation retardées de retrouver leur événement
sans rejouer l'historique antérieur à l'installation. Les ID de notification
ne sont pas persistés car GitHub les réutilise pour l'activité ultérieure sur
le même thread.

## Vérification

Le test ciblé de l'adaptateur couvre chaque route, les métadonnées de
déclenchement direct, le retrait des mentions, l'autorisation des agrégats et
la déduplication des commentaires et des événements directs.
