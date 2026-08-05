# Noms de groupes des canaux observés

## Problème

Le graphe de contacts observés à portée de workspace introduit par #7109
préserve les identifiants de groupe complets de la plateforme, mais chaque
`groups[].label` retombe actuellement sur cet identifiant. Certains callbacks
de canal entrant portent déjà un nom de groupe lisible, et les adaptateurs le
rejettent avant la frontière d'observation partagée.

Les utilisateurs qui choisissent une cible de livraison proactive ont besoin
du nom lisible à côté de l'identifiant de plateforme complet et stable. Le
nom est une métadonnée observationnelle, pas une clé de routage.

## Périmètre

Ajouter un nom de groupe optionnel à l'enveloppe entrante partagée et le
renseigner uniquement à partir de métadonnées déjà présentes dans un message
entrant accepté.

- DingTalk mappe le `conversationTitle` du callback Stream.
- Telegram mappe le `title` du chat entrant pour les groupes et
  supergroupes.
- Feishu conserve le fallback sur le `chat_id` complet car
  `im.message.receive_v1` n'inclut pas de nom d'affichage du chat.
- Les autres adaptateurs conservent le fallback sur l'identifiant sauf si
  leur payload entrant existant possède un champ de nom de groupe documenté.

Ce changement n'appelle pas d'API d'annuaire de plateforme, de détail de
groupe ou d'information de chat ; n'ajoute pas de permissions ; ne modifie
pas le routage ni l'identité de session ; ne découvre pas d'appartenance
faisant autorité ; n'observe pas les sorties du bot ; et n'ajoute pas de noms
de topic.

## Contrat

`Envelope` gagne un champ optionnel :

```ts
chatName?: string;
```

Le champ décrit le nom d'affichage du `chatId` tel qu'observé sur ce message.
Il est ignoré pour les messages directs. `chatId` reste la clé de livraison
complète de la plateforme et continue de déterminer les sessions, la
déduplication et l'identité du graphe.

Le chemin d'observation commun utilise un `chatName` assaini et non vide
comme label de groupe. Les valeurs manquantes ou inutilisables retombent sur
le `chatId` complet. Les bornes existantes du store du registre limitent les
labels persistés à 256 unités de code UTF-16 sans couper les paires de
substitution.

## Sémantique de rafraîchissement

Un message accepté ultérieur pour le même canal, le même utilisateur et le
même groupe rafraîchit l'observation. S'il porte un `chatName` utilisable
différent, la sémantique de remplacement du store existant met à jour le
label de groupe dérivé sans créer un autre nœud de groupe. La fraîcheur reste
`lastObservedAt` ; les noms ne sont pas traités comme permanents ou faisant
autorité.

Une plateforme qui omet un nom de groupe sur un message ultérieur contribue
le fallback sur l'identifiant pour cette observation. La dérivation du graphe
sélectionne déjà l'observation la plus récente, donc le label renvoyé
représente la preuve acceptée la plus récente plutôt qu'un cache de noms
caché à longue durée de vie.

## Preuves de plateforme

- L'exemple de message robot Stream de DingTalk inclut `conversationTitle`
  dans le callback entrant : [DingTalk Stream protocol](https://opensource.dingtalk.com/developerpedia/docs/learn/stream/protocol/#%E5%9B%9E%E8%B0%83%E6%8E%A8%E9%80%81).
- Telegram définit `Message.chat` comme un `Chat`, dont le `title` est
  disponible pour les chats de groupe et les supergroupes :
  [Telegram Bot API — Chat](https://core.telegram.org/bots/api/#chat).
- L'événement de réception de message de Feishu énumère `chat_id`,
  `chat_type` et `thread_id`, mais aucun nom d'affichage du chat :
  [Feishu Open Platform — Receive message](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive).

## Stratégie de test

- Les tests du canal de base prouvent que les noms de groupe utilisables se
  propagent, que les noms inutilisables retombent sur les identifiants
  complets, que les messages directs ignorent `chatName` et que des
  observations ultérieures peuvent rafraîchir les labels.
- Les tests de l'adaptateur DingTalk prouvent que `conversationTitle` entre
  dans l'enveloppe sans changer le traitement des callbacks.
- Les tests de l'adaptateur Telegram prouvent que les titres de groupe et de
  supergroupe entrent dans l'enveloppe tandis que les chats privés restent
  inchangés.
- Les tests Feishu existants continuent de prouver le chemin de fallback sur
  l'identifiant sans trafic API.
- Des tests de store ciblés couvrent le remplacement par des labels plus
  récents ; aucune migration de schéma n'est nécessaire car les observations
  persistées contiennent déjà `group.label`.
