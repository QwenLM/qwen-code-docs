# Statut runtime des sessions du démon

## Problème

Les clients du démon peuvent interroger une session live via
`GET /session/:id/status` et énumérer les sessions via
`GET /workspace/:id/sessions`, mais le seul signal d'activité runtime
aujourd'hui est `hasActivePrompt`. Les clients ne peuvent pas distinguer un
tour en attente d'une permission ordinaire, une réponse à
`ask_user_question`, ou un tour en échec dont l'erreur doit rester visible
jusqu'à la reprise du travail.

## Design

Le bridge ACP possède une petite extension de statut en mémoire sur chaque
`SessionEntry` live :

- `hasTurnError` et `turnError` stockent l'erreur terminale du dernier tour
  en échec.
- `pendingInteractions` associe les ids de requêtes de permission en attente
  à des actions de permission ou des questions utilisateur normalisées et
  prêtes à être rendues.

Le cycle de vie du prompt existant reste la source de `hasActivePrompt`. Un
tour en échec enregistre son `message` assaini, son `code` optionnel et son
`errorKind` optionnel lorsqu'il émet l'événement SSE `turn_error` existant.
L'erreur reste visible jusqu'à ce que le prochain prompt en file atteigne le
dispatch et démarre réellement ; un prompt accepté mais en file ne l'efface
pas.

L'enfant ACP marque explicitement les requêtes de permission
`ask_user_question` dans les métadonnées de l'appel d'outil. Le bridge lit
uniquement ce marqueur stable, au lieu de déduire la catégorie du texte de
l'UI ou d'un nom d'outil.

## API

Le résumé live existant gagne des champs additifs optionnels :

- `isWaitingForPermission`
- `isWaitingForUserQuestion`
- `pendingInteractionCount`
- `hasTurnError`
- `turnError` (`message`, `code` optionnel, `errorKind` optionnel)
- `pendingInteractions` : titre/contenu/input de l'action et options
  sélectionnables pour les permissions ; questions et options sélectionnables
  pour `ask_user_question`. Chaque question porte un `answerKey` pour le
  payload de vote de permission `answers: Record<string, string>`.

`GET /session/:id/status` renvoie tous les champs pour une session live. La
liste de sessions du workspace porte les mêmes champs runtime, y compris
`turnError` et `pendingInteractions`, pour les entrées live afin que les
appelants puissent rendre et approuver les interactions directement lors du
polling par lot. Les sessions persistées qui ne sont pas live omettent les
nouveaux champs afin que les appelants ne confondent pas un état runtime
indisponible avec un état idle connu.

## Périmètre

Ceci ne persiste pas l'état runtime à travers les redémarrages du démon,
n'ajoute pas de nouvel endpoint et ne remplace pas SSE pour la consommation
détaillée d'événements. La route de vote existante
`POST /session/:id/permission/:requestId` résout un élément en attente ; les
réponses aux questions utilisent son extension `answers` existante.
