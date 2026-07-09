# Vue d'ensemble du statut du cycle de vie des canaux

Date : 2026-07-01

## Objectif

Fournir un point de revue unique résumant le comportement du statut du cycle de vie des adaptateurs de canaux pris en charge et précisant ce qui reste intentionnellement hors périmètre.

## Périmètre

- Telegram
- Weixin
- DingTalk
- Feishu

## Hors périmètre explicite

- Slack reste hors périmètre.
- QQ Bot reste hors périmètre pour l'UI du statut du cycle de vie.
- L'exemple de plugin reste hors périmètre pour l'UI du statut du cycle de vie.
- L'emoji de fin de DingTalk reste hors périmètre.

## Matrice de revue

| Canal | Événements du cycle de vie pris en charge | Surface native | Comportement de `started` | Comportement de `text_chunk` | Comportement terminal | Raison de non-support / no-op | Fichiers de test exacts |
| -------------- | --------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Telegram | `started`, `completed`, `cancelled`, `failed` | Indicateur de frappe | Démarre la boucle de frappe existante par chat une seule fois. Les événements `started` dupliqués n'ajoutent pas de nouvelle boucle. | Ignoré par le hook du cycle de vie. Le contenu de la réponse continue par le chemin de réponse normal. | Arrête la boucle de frappe sur tout événement terminal et ne laisse aucun intervalle obsolète. | `tool_call` n'a pas de surface de statut native et n'a pas besoin d'UI d'adaptateur. | `packages/channels/telegram/src/TelegramAdapter.test.ts` |
| Weixin | `started`, `completed`, `cancelled`, `failed` | Indicateur de frappe | Appelle `setTyping(chatId, true)` une seule fois pour le chat actif. Les événements `started` dupliqués ne réempilent pas l'état de frappe. | Ignoré par le hook du cycle de vie. Le contenu de la réponse continue par le chemin d'envoi normal. | Appelle `setTyping(chatId, false)` sur les événements terminaux. Les tentatives de démarrage échouées effacent l'état local pour qu'un `started` ultérieur puisse réessayer. | `tool_call` n'a pas de surface de statut séparée et aucun message supplémentaire ne doit être envoyé. | `packages/channels/weixin/src/WeixinAdapter.test.ts` |
| DingTalk | `started`, `completed`, `cancelled`, `failed` | Réaction « œil » sur le message entrant | Attache la réaction « œil » existante une seule fois lorsqu'un id de conversation est disponible. | Ignoré par le hook du cycle de vie. Le contenu de la réponse continue par le chemin d'envoi normal. | Supprime la réaction « œil » sur les événements terminaux, y compris les conditions de course d'attachement à résolution tardive après une annulation. | Les chats webhook de robot directs n'exposent pas l'id de conversation nécessaire pour les réactions, le statut du cycle de vie y est donc un no-op. `tool_call` n'a également pas d'UI dans le périmètre. | `packages/channels/dingtalk/src/DingtalkAdapter.test.ts` |
| Feishu | `started`, `completed`, `cancelled`, `failed` | Label de statut de la carte en streaming | Maintient la carte dans son état d'exécution et réserve l'espace pour le label d'exécution tant que le flux de carte existant est actif. | N'est pas consommé directement par le hook du cycle de vie. Le streaming de contenu reste géré par le hook de flux de réponse/carte existant. | Finalise le label de statut de la carte comme terminé, annulé ou échoué sans écraser le corps de la réponse en streaming. | `tool_call` reste masqué car la carte utilise déjà le flux de réponse ainsi que les labels de statut terminal uniquement. | `packages/channels/feishu/src/adapter.test.ts`, `packages/channels/feishu/src/markdown.test.ts` |
| QQ Bot | Aucun | Aucun | No-op. | No-op. QQ Bot diffuse toujours les morceaux de réponse via les envois de messages sortants, mais pas via les mises à jour du statut du cycle de vie. | No-op. | Le canal n'a pas de point de terminaison de frappe ou de statut de tâche, et `QQChannel` laisse `onPromptStart`, `onPromptEnd` et `onTaskLifecycle` vides par conception. | `packages/channels/qqbot/src/send.test.ts`, `packages/channels/qqbot/src/api.test.ts` |
| Plugin example | Aucun | Messages du protocole WebSocket uniquement | No-op pour le statut du cycle de vie. | Diffuse les morceaux de réponse via le type de message `chunk` du protocole simulé depuis `onResponseChunk`, en dehors de la gestion du statut du cycle de vie. | Envoie le message sortant final à la fin de la réponse, en dehors de la gestion du statut du cycle de vie. | Le canal simulé démontre uniquement le câblage du transport ; il n'a pas de surface native de frappe, de réaction ou de statut. | `integration-tests/channel-plugin.test.ts` |

## Notes de revue

- Le `text_chunk` du cycle de vie de Feishu reste un no-op dans le hook du cycle de vie. Il n'ajoute ni ne met à jour le contenu de la réponse à cet endroit.
- Slack est intentionnellement exclu de cette matrice car il est hors périmètre.
- Les événements terminaux de DingTalk se contentent de supprimer la réaction « œil » existante dans ce périmètre. Aucun emoji de fin n'est ajouté.