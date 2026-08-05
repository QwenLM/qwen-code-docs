# Statut et détails des agents en arrière-plan

## Problème

Un appel d'outil Agent revient dès qu'un agent en arrière-plan est lancé. Son bloc de transcription possède donc un événement d'outil terminal dont le payload indique `status: background`. Le Web Shell reprojette intentionnellement ce résultat de lancement sur une carte d'outil en attente, mais rien ne réconcilie ensuite la carte avec le registre des tâches d'arrière-plan en cours d'exécution. La liste des tâches du pied de page atteint un état terminal alors que la carte Agent d'origine reste en cours d'exécution.

Les agents au premier plan s'ouvrent déjà dans le panneau de détails des sous-agents partagé. Les agents en arrière-plan ont le même `toolUseId`, la même entrée de registre de tâches, la même transcription JSONL et le même résolveur de session virtuelle, mais ce chemin manque de couverture explicite.

## Conception

Conserver la projection de lancement inchangée : un résultat de lancement avec `status: background` reste en attente jusqu'à l'arrivée de l'état de tâche faisant autorité. Le démon émet déjà des notifications terminales de background-agent sur le flux SSE de session avec le `status` de la tâche et le `toolUseId`. Le Web Shell consomme ces métadonnées de notification masquées et les réconcilie avec la carte d'outil Agent projetée.

- `completed` et `cancelled` terminent la carte.
- `failed` met la carte en échec.
- L'horodatage de la notification devient l'heure de fin de la carte.
- Les notifications sans `toolUseId`, les notifications non-agent et les appels d'outils sans rapport ne modifient pas directement les messages.

Le fournisseur de détails des sous-agents existant reste le seul chemin UI. Les cartes d'Agent en arrière-plan restent cliquables pendant l'attente et après la réconciliation terminale. Le résolveur de session virtuelle continue de diffuser en streaming le JSONL de la tâche et d'obtenir le statut en direct depuis le registre des tâches sans filtrer sur le mode premier plan/arrière-plan. Pour les tâches héritées sans `toolUseId`, il fait correspondre l'enregistrement de lancement avec le sidecar persisté et conserve un statut de sidecar terminal lorsque le résultat de lancement en arrière-plan d'origine indique encore `running`.

Tant qu'un travail détaché est actif, sa carte dans la liste principale utilise un libellé statique dédié `background task` au lieu du libellé `running` du premier plan. La carte n'utilise pas le shimmer d'exécution ni un chronomètre de durée écoulée qui s'incrémente. Les notifications terminales remplacent ce libellé par la présentation normale completed, failed ou cancelled.

Les agents en arrière-plan sont omis de la barre de statut inférieure car leur progression est disponible depuis la carte cliquable et le panneau de détails. Ils restent dans le panneau Tasks complet. Les autres types de tâches en arrière-plan, y compris les commandes shell, restent dans la barre de statut inférieure et conservent leur polling existant. Un Agent en arrière-plan seul n'active pas le polling des tâches de la barre inférieure.

Les enregistrements de notification persistés ne conservent pas toujours un `toolUseId`. Lorsqu'une transcription chargée contient une carte d'Agent en arrière-plan active, le Web Shell résout donc chaque carte en attente via l'endpoint de sous-agent existant après le rattrapage de la transcription. Il répète cette vérification unique après une reconnexion et lorsque n'importe quelle notification terminale d'Agent arrive, même si cette notification ne peut pas identifier la carte directement. Il ne démarre jamais d'intervalle. Le focus de saisie et le streaming ordinaire ne modifient pas les ID d'appel Agent en attente ni la clé de notification terminale et ne déclenchent donc pas de nouvelle requête.

Le panneau de détails ancré se déploie depuis le bord droit afin que le chat soit poussé vers la gauche en continu au lieu d'être redimensionné avant un mouvement séparé du panneau. Les préférences de mouvement réduit désactivent l'animation d'ancrage. Les onglets du panneau gardent une largeur fixe, tronquent les titres longs et défilent horizontalement lorsque la liste d'onglets dépasse l'espace disponible.

## Périmètre

Ce changement met à jour la projection du Web Shell et le résolveur de statut des sous-agents virtuels du démon. Il ne réécrit pas les transcriptions parentes persistées, ne modifie pas le cycle de vie des tâches, n'ajoute pas de polling de tâches pour les agents en arrière-plan, ne retire pas les agents du panneau Tasks complet et n'ajoute pas un second visionneur de sous-agents.
