# Conception de la livraison en conversation directe DingTalk via Webhook

## Statut

Implémenté et validé avec un test réel de la chaîne complète en conversation directe. Issue correspondante :
[QwenLM/qwen-code#6883](https://github.com/QwenLM/qwen-code/issues/6883).

## Contexte

Un channel hébergé par le démon peut recevoir des événements Webhook externes authentifiés, exécuter l'agent sous forme de tâche sans surveillance et livrer activement le résultat final à une cible de conversation préconfigurée. Actuellement, DingTalk ne prend en charge que la livraison vers des conversations de groupe : la cible doit définir `isGroup: true` et l'adaptateur envoie le Markdown via l'API de messages de groupe.

Cela empêche les sources Webhook telles que les systèmes de CI ou les alertes de supervision de notifier directement un utilisateur DingTalk responsable ; elles ne peuvent livrer que vers une conversation de groupe.

## Objectifs

- Livrer les résultats des tâches Webhook du démon vers des cibles de conversation directe DingTalk.
- Conserver inchangé le comportement existant de livraison Webhook vers les conversations de groupe DingTalk.
- Conserver la livraison proactive ordinaire et la boucle de channel n'acceptant toujours que des cibles de groupe DingTalk, sans prendre l'ID de conversation d'une conversation directe entrante pour un ID d'utilisateur.
- Réutiliser la structure existante de configuration des cibles, le cache de tokens, le formatage Markdown, le découpage des messages, les retries et le traitement des erreurs de livraison.
- Continuer avec le channel DingTalk existant, sans nouveau channel ni champ de configuration.

## Non-objectifs

- Les Cards natives DingTalk ou les callbacks de Card.
- Les mises à jour en streaming des Cards, les boutons, les feedbacks ou l'annulation de tâche depuis DingTalk.
- Plusieurs destinataires pour une seule cible.
- La livraison dans les sujets DingTalk.
- Un nouveau type de channel ou une modification du protocole Webhook du démon.

## Configuration des cibles

Aucun nouveau champ de configuration n'est nécessaire. La signification des champs de cible Webhook existants dans le channel DingTalk est la suivante :

| `isGroup` | Signification de `chatId`     | API de livraison              |
| --------- | ----------------------------- | ----------------------------- |
| `true`    | `openConversationId` du groupe DingTalk | `robot/groupMessages/send`    |
| `false`   | ID d'utilisateur DingTalk     | `robot/oToMessages/batchSend` |

`senderId` reste l'identité virtuelle utilisée pour router la tâche Webhook vers la session de l'agent, et non un ID de destinataire DingTalk.

Exemple de configuration :

```json
{
  "webhooks": {
    "sources": {
      "github-ci": {
        "secretEnv": "QWEN_CHANNEL_GITHUB_CI_SECRET",
        "targets": {
          "operator": {
            "chatId": "DINGTALK_USER_ID",
            "senderId": "webhook:github-ci",
            "isGroup": false
          },
          "team": {
            "chatId": "OPEN_CONVERSATION_ID",
            "senderId": "webhook:github-ci",
            "isGroup": true
          }
        }
      }
    }
  }
}
```

Une cible doit définir explicitement `isGroup`. Les cibles suivantes continuent d'être rejetées par l'adaptateur : `chatId` vide, `threadId` défini, `isGroup` manquant, ou utilisation d'une URL Webhook à la place d'un ID de cible stable.

## Chaîne de livraison

Le routage du démon et l'IPC du worker restent inchangés ; le runtime de channel partagé ajoute uniquement une vérification de cible dédiée aux Webhooks :

```text
POST /channels/:channelName/webhooks/:source
  -> le démon authentifie et valide l'événement
  -> le worker de channel exécute la tâche d'agent sans surveillance
  -> ChannelBase appelle DingtalkChannel.pushProactive()
  -> l'adaptateur choisit l'API DingTalk selon target.isGroup
  -> DingTalk reçoit le Markdown
```

Le runtime de channel partagé utilise une vérification de capacité de cible Webhook distincte. L'implémentation par défaut continue d'utiliser les règles de cible de la livraison proactive ordinaire ; DingTalk n'accepte en plus `isGroup: false` que lors de la résolution des tâches Webhook. Ainsi, la boucle de channel ordinaire continue de rejeter les cibles de conversation directe, évitant de confondre le `conversationId` d'une conversation directe entrante avec l'ID d'utilisateur requis par l'API de messages un-à-un.

Les cibles de groupe continuent d'utiliser le corps de requête existant :

```json
{
  "robotCode": "CLIENT_ID",
  "openConversationId": "OPEN_CONVERSATION_ID",
  "msgKey": "sampleMarkdown",
  "msgParam": "{...}"
}
```

Les cibles de conversation directe envoient le même modèle Markdown via l'API de messages un-à-un :

```json
{
  "robotCode": "CLIENT_ID",
  "userIds": ["DINGTALK_USER_ID"],
  "msgKey": "sampleMarkdown",
  "msgParam": "{...}"
}
```

Les deux chemins partagent le cache existant d'access token, rafraîchi une minute avant l'expiration du token ; en cas de HTTP 401, un retry est effectué une fois ; les mêmes limitations de normalisation et de découpage du Markdown sont utilisées. Une livraison en plusieurs fragments s'arrête après l'échec du premier fragment.

## Gestion des erreurs

- Une cible invalide ne passe pas la validation de la tâche Webhook avant même l'exécution de l'agent.
- Un échec d'obtention du token reste traité comme un échec de livraison, avec une journalisation qui n'expose pas les identifiants.
- Un HTTP 401 efface le token en cache et effectue un retry une fois pour le fragment courant.
- Les autres réponses HTTP non réussies interrompent la livraison et affichent dans le journal du worker de channel les détails d'erreur API après dissimulation.
- Le `202 {"accepted": true}` renvoyé par le démon signifie toujours uniquement que le worker a accepté la tâche, et non que la livraison DingTalk a réussi.

Seul le Markdown est pris en charge dans le périmètre de cette itération, aucune stratégie de repli Markdown n'est donc à concevoir.

## Tests

### Tests unitaires

- Le Webhook accepte des cibles de groupe et de conversation directe explicitement configurées ; la livraison proactive ordinaire n'accepte toujours que les cibles de groupe.
- Rejeter les cibles sans `isGroup`, avec un ID vide, utilisant une URL Webhook ou définissant `threadId`.
- Conserver inchangés l'endpoint de groupe existant et le corps de requête contenant `openConversationId`.
- La conversation directe utilise l'endpoint de messages un-à-un et le corps de requête contenant `userIds`.
- Les envois de groupe et de conversation directe partagent le token en cache.
- Après un HTTP 401, rafraîchir le token et n'effectuer qu'un seul retry.
- La livraison en conversation directe suit également les règles de découpage des messages et d'interruption dès le premier échec.

### Vérification locale de bout en bout

Rédiger le plan de test sous `.qwen/e2e-tests/`, en utilisant d'abord le CLI `qwen` installé globalement, et enregistrer le comportement de référence actuel où les cibles Webhook de conversation directe sont rejetées. Une fois l'implémentation terminée :

1. Configurer respectivement une cible de conversation directe et une cible de groupe.
2. Activer le channel DingTalk et démarrer `qwen serve`.
3. Soumettre un événement avec `curl` vers chacun des deux `targetRef`.
4. Confirmer que les deux requêtes renvoient `202`.
5. Confirmer que le worker de channel termine les deux tâches.
6. Confirmer que l'utilisateur DingTalk cible et la conversation de groupe reçoivent tous deux le message Markdown attendu.

S'il n'y a pas localement d'identifiants DingTalk ou de cible de réception disponibles, utiliser les tests unitaires comme vérification automatisée de la livraison, en précisant clairement les étapes de vérification en ligne manquantes.

## Documentation

Mettre à jour la documentation des Webhooks de channel pour montrer les deux configurations de cible DingTalk, conversation directe et groupe, et préciser que le `chatId` d'une cible de conversation directe doit être un ID d'utilisateur DingTalk.

## Compatibilité

Il s'agit d'un changement incrémental. La configuration, la validation, l'endpoint, le corps de requête, le formatage et le comportement de retry des cibles de groupe existantes restent tous inchangés, sans migration de configuration nécessaire. La nouvelle vérification de cible Webhook du runtime partagé délègue par défaut à l'ancienne vérification de cible de livraison proactive ; le comportement des autres channels reste donc inchangé.
