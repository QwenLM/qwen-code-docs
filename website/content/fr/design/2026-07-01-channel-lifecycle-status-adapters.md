# Adaptateurs de statut du cycle de vie des canaux

Date: 2026-07-01

## Objectif

Exposer l'état du cycle de vie des tâches via les quatre premiers adaptateurs de canal :

- Telegram
- Weixin
- DingTalk
- Feishu

Ceci est un suivi P1.1 du travail sur l'identité des canaux et les métadonnées du cycle de vie.
L'objectif est de faire afficher à chaque canal pris en charge le meilleur signal de progression natif
disponible, sans modifier à nouveau le contrat de canal partagé.

## Hors périmètre

- Ne pas implémenter le comportement de Slack.
- Ne pas implémenter le comportement de QQ Bot.
- Ne pas mettre à jour les exemples de mock/plugin.
- Ne pas ajouter d'emoji terminal pour DingTalk.
- Ne pas introduire d'abstraction de rendu de statut partagée pour cette série de
  mappages spécifiques à chaque adaptateur.

## Références et alignement

La conception s'appuie d'abord sur les capacités actuelles des adaptateurs de canal Qwen.
La sémantique du cycle de vie reste alignée sur le modèle de statut des tâches/sessions
existant déjà utilisé dans ce dépôt : une tâche peut démarrer, s'exécuter, se terminer, être
annulée ou échouer. Aucun modèle de statut externe supplémentaire n'est introduit dans ce
périmètre, car chaque canal dispose déjà d'une surface native claire pour ces états.

## État actuel

| Canal | Surface de statut existante | Comportement actuel |
| -------- | ----------------------- | -------------------------------------------------------------------- |
| Telegram | Indicateur de saisie | Démarre la saisie au début du prompt et l'arrête à la fin du prompt. |
| Weixin | Indicateur de saisie | Démarre la saisie au début du prompt et l'arrête à la fin du prompt. |
| DingTalk | Réaction au message | Ajoute la réaction "œil" au début du prompt et la retire à la fin du prompt. |
| Feishu | Carte en streaming | Affiche et met à jour une carte en streaming, avec des chemins de complétion et d'erreur. |

## Conception proposée

Maintenir l'implémentation au niveau de l'adaptateur. Chaque adaptateur consomme le hook
d'événement du cycle de vie et mappe l'événement vers la surface de statut native existante de la plateforme.

| Événement du cycle de vie | Telegram | Weixin | DingTalk | Feishu |
| --------------- | ------------- | ------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| `started` | Démarrer la saisie. | Démarrer la saisie. | Ajouter la réaction "œil". | Afficher/mettre à jour la carte comme en cours d'exécution. |
| `text_chunk` | Ignorer. | Ignorer. | Ignorer. | Ignorer dans le hook du cycle de vie. Le streaming de contenu reste sur le chemin de flux de réponse/carte existant. |
| `tool_call` | Ignorer. | Ignorer. | Ignorer. | Ignorer pour l'UI. |
| `completed` | Arrêter la saisie. | Arrêter la saisie. | Retirer la réaction "œil". | Marquer la carte comme terminée. |
| `cancelled` | Arrêter la saisie. | Arrêter la saisie. | Retirer la réaction "œil". | Marquer la carte comme annulée. |
| `failed` | Arrêter la saisie. | Arrêter la saisie. | Retirer la réaction "œil". | Marquer la carte comme échouée. |

### Telegram

Telegram conserve l'implémentation de saisie existante. Le hook du cycle de vie doit associer
`started` au chemin de démarrage de la saisie existant et tous les événements terminaux au
chemin d'arrêt de la saisie existant.

`text_chunk` et `tool_call` ne nécessitent pas de modifications de l'UI Telegram.

### Weixin

Weixin suit la même structure que Telegram. Le hook du cycle de vie doit associer
`started` à `setTyping(true)` et les événements terminaux à `setTyping(false)`.

Aucun message supplémentaire n'est envoyé.

### DingTalk

DingTalk conserve le comportement de réaction "œil" existant :

- `started` : attacher la réaction "œil" existante.
- `completed`, `cancelled`, `failed` : retirer la réaction "œil" existante.

Il n'y a pas d'emoji terminal dans ce périmètre. Les tâches échouées et annulées ne doivent pas
envoyer de messages de statut supplémentaires, sauf si un chemin d'erreur existant le fait déjà.

### Feishu

Feishu conserve la carte en streaming comme surface de statut et rend l'état terminal
explicite dans le contenu de la carte :

| État | Libellé de la carte |
| --------- | ---------------- |
| Running | `运行中...` |
| Completed | `已完成` |
| Cancelled | `已取消` |
| Failed | `已失败，请重试` |

La carte diffuse toujours le contenu de la réponse comme aujourd'hui via le hook de flux
de réponse/carte existant. Le `text_chunk` du cycle de vie n'est pas consommé directement par
l'adaptateur dans ce périmètre, ce qui remplace l'idée précédente au niveau de l'adaptateur
d'utiliser les chunks du cycle de vie pour ajouter du contenu à la carte. `tool_call` reste masqué
de l'UI de la carte dans ce périmètre.

Le helper markdown/carte peut accepter une option de libellé de statut minimale si nécessaire, mais
ne doit pas se transformer en framework de rendu générique.

## Flux de données

1. L'exécution du canal émet des événements du cycle de vie depuis la couche de canal de base.
2. L'adaptateur sélectionné reçoit l'événement via son hook de cycle de vie.
3. L'adaptateur associe l'événement à la surface de statut de la plateforme.
4. Les mises à jour de statut de la plateforme s'exécutent en best-effort et n'affectent pas l'exécution de la tâche.

Le payload de l'événement du cycle de vie doit fournir suffisamment de contexte existant pour identifier
le message/la session du canal. Si un identifiant spécifique à la plateforme est manquant, l'adaptateur
ignore la mise à jour du statut.

## Gestion des erreurs

Les mises à jour de statut de la plateforme ne sont pas critiques. L'échec d'une mise à jour de statut
de saisie, de réaction ou de carte doit être journalisé ou ignoré selon le style existant de l'adaptateur
et ne doit pas faire échouer la tâche.

Les événements terminaux doivent être idempotents pour un message/une session. Les événements
terminaux répétés ne doivent pas créer de mises à jour de statut en double ni laisser un indicateur
d'exécution obsolète.

Feishu nécessite une attention particulière car il dispose déjà de flux de complétion de carte, d'erreur
et de bouton d'arrêt. Le mappage du cycle de vie doit réutiliser l'état de session de carte existant
et éviter les mises à jour concurrentes qui écraseraient un état terminal plus spécifique.

## Plan de test

Ajouter une couverture unitaire ciblée dans les packages de canaux concernés :

- Telegram : le `started` du cycle de vie démarre la saisie ; les événements terminaux arrêtent la saisie ; aucun
  intervalle de saisie en double n'est introduit.
- Weixin : le `started` du cycle de vie appelle `setTyping(true)` ; les événements terminaux appellent
  `setTyping(false)`.
- DingTalk : le `started` du cycle de vie attache la réaction "œil" ; les événements terminaux
  la retirent ; aucun emoji terminal n'est envoyé.
- Feishu : les états de carte en cours d'exécution, terminé, annulé et échoué affichent les
  libellés attendus ; le `text_chunk` du cycle de vie reste géré par le chemin de flux existant
  plutôt que par le hook du cycle de vie ; `tool_call` n'ajoute pas de sortie UI.

La vérification doit exécuter les commandes Vitest locales au package pour les adaptateurs modifiés,
puis le build du projet et le typecheck avant que la PR ne soit soumise.

## Décisions en suspens

Aucune. Le périmètre actuel est volontairement restreint et suit les capacités existantes des adaptateurs.