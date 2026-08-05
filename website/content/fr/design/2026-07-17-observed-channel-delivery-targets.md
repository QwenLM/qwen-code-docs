# Contacts observés des canaux à portée de workspace

## Problème

Les workers de canal gérés par le démon reçoivent des identifiants de
plateforme pour les utilisateurs, groupes et topics sur les messages entrants,
mais ces identifiants sont transitoires. Les clients de workspace authentifiés
ont besoin d'une API de lecture qui liste les contacts IM récemment observés
afin qu'un utilisateur puisse sélectionner une cible de livraison de
plateforme complète sans rechercher ni ressaisir manuellement les
identifiants.

## Périmètre

Ce changement observe les messages entrants acceptés, persiste un graphe de
relations borné par workspace du démon, et renvoie les identifiants de
plateforme complets pour les canaux DingTalk, Feishu, Telegram et WeCom.

Il ne modifie pas la configuration des webhooks ni la livraison proactive,
n'interroge pas un annuaire de plateforme, ne prétend pas renvoyer
l'appartenance complète à un groupe, n'observe pas les sorties du bot et ne
récupère pas le trafic historique. Le `qwen channel start` autonome est
inchangé.

## Propriété et persistance

Le runtime du workspace du démon possède le registre :

```text
$QWEN_HOME/channels/daemon/<workspaceHash>/observed-contacts.json
```

`QWEN_HOME` est au niveau du processus, mais `<workspaceHash>` partitionne les
données par chemin de workspace canonique. Le registre n'est pas stocké dans
le checkout du workspace et n'est pas partagé comme un unique graphe global au
processus. Son répertoire utilise le mode `0700` lorsque c'est pris en charge ;
le fichier JSON atomique utilise le mode `0600`.

Le registre stocke au plus 500 observations de relations, tous canaux et
conversations confondus dans le workspace. Chaque observation contient
`channelName`, une identité utilisateur, une identité de groupe optionnelle,
une identité de topic optionnelle et `lastObservedAt`. La clé de
déduplication est `[channelName, user.id, group?.id, topic?.id]`. Une
conversation bruyante peut donc évincer des observations plus anciennes d'une
autre conversation. Les observations plus anciennes que la fenêtre lisible
maximale de 365 jours sont supprimées à la prochaine écriture acceptée.

## Frontière d'observation

L'enregistrement intervient après que le preflight entrant partagé a accepté
un véritable message IM et avant que le traitement de la commande ou de
l'Agent ne commence. La politique directe/groupe, la mention, la liste
d'autorisation des expéditeurs et le rejet par appariement ont donc lieu avant
la persistance.

Le même objet `Envelope` est enregistré au plus une fois. Un message ultérieur
rafraîchit l'horodatage et les labels de la relation correspondante. La
persistance est best-effort : une erreur assainie est journalisée sans
identifiants, et le traitement du message accepté continue.

Le registre ne stocke jamais le texte des messages, les identifiants de
message, les pièces jointes, les payloads, les credentials, les requêtes de
webhook, les envois proactifs ou les sorties du bot.

## Modèle de relations

```ts
interface ObservedChannelContactObservation {
  user: { id: string; label: string };
  group?: { id: string; label: string };
  topic?: { id: string; label: string };
}
```

- Un message direct enregistre un utilisateur de premier niveau à partir du
  `senderId` de plateforme complet.
- Un message de groupe enregistre le groupe à partir du `chatId` de
  plateforme complet et l'utilisateur observé à l'intérieur de ce groupe.
- Un message de groupe dans un fil enregistre aussi le topic à partir du
  `threadId` et l'utilisateur observé à l'intérieur de ce topic.
- Un utilisateur vu uniquement dans des groupes n'apparaît pas dans les
  `users` de premier niveau. Si le même utilisateur envoie aussi un message
  direct, il apparaît à la fois au premier niveau et sous les groupes
  concernés.
- `groups[].users` et `groups[].topics[].users` désignent les utilisateurs
  observés dans ces conversations. Ce ne sont pas des listes d'appartenance
  de plateforme faisant autorité.
- Les labels d'expéditeur utilisent le nom d'affichage entrant assaini, avec
  un fallback sur l'identifiant utilisateur complet. Les labels de groupe
  utilisent un nom assaini lorsque l'enveloppe entrante acceptée en fournit
  un ; DingTalk mappe `conversationTitle` et Telegram mappe `chat.title`. Les
  labels de groupe Feishu et WeCom, ainsi que tous les labels de topic, ont
  pour fallback leurs identifiants complets.

Feishu mappe `root_id` sur `threadId` ; Telegram mappe `message_thread_id`
sur `threadId`. Les enveloppes actuelles de DingTalk et WeCom n'exposent pas
d'identifiant de topic stable, donc leurs observations s'arrêtent au niveau
du groupe.

## Fraîcheur

Les personnes, les conversations et les relations changent. L'API de lecture
filtre les observations plutôt que de présenter le registre comme une vérité
permanente :

- fraîcheur par défaut : sept jours ;
- override par l'appelant : `freshWithinSeconds`, de 1 seconde à 365 jours ;
- les horodatages des utilisateurs, des utilisateurs de groupe, des
  utilisateurs de topic, des groupes et des topics sont dérivés
  indépendamment des observations récentes ;
- une observation passive ne peut pas détecter immédiatement un départ, une
  suppression ou un renommage qui ne produit aucun nouveau message, donc les
  relations obsolètes ne disparaissent que lorsqu'elles dépassent la fenêtre
  demandée.

## API de lecture

Workspace primaire :

```http
GET /workspace/channel/observed-contacts?freshWithinSeconds=604800
Authorization: Bearer <daemon token>
```

Workspace enregistré sélectionné :

```http
GET /workspaces/:workspace/channel/observed-contacts?freshWithinSeconds=604800
Authorization: Bearer <daemon token>
```

Exemple :

```json
{
  "users": [
    {
      "channelName": "feishu-main",
      "label": "Example User",
      "id": "ou_complete_user_id",
      "lastObservedAt": "2026-07-17T08:00:00.000Z"
    }
  ],
  "groups": [
    {
      "channelName": "feishu-main",
      "label": "oc_complete_chat_id",
      "id": "oc_complete_chat_id",
      "lastObservedAt": "2026-07-17T08:05:00.000Z",
      "users": [
        {
          "label": "Example User",
          "id": "ou_complete_user_id",
          "lastObservedAt": "2026-07-17T08:05:00.000Z"
        }
      ],
      "topics": [
        {
          "label": "om_complete_root_id",
          "id": "om_complete_root_id",
          "lastObservedAt": "2026-07-17T08:05:00.000Z",
          "users": [
            {
              "label": "Example User",
              "id": "ou_complete_user_id",
              "lastObservedAt": "2026-07-17T08:05:00.000Z"
            }
          ]
        }
      ]
    }
  ]
}
```

Les réponses utilisent `Cache-Control: no-store`. La route primaire lit
uniquement la partition du workspace primaire. La route qualifiée exige un
runtime enregistré exact et fiable, et ne retombe jamais sur le primaire pour
des workspaces inconnus, non fiables, en amorçage, en drain ou retirés.

Un registre manquant renvoie un graphe vide. Des données malformées renvoient
un `500` assaini avec le code `channel_observed_contacts_unavailable`.
Supprimez le fichier `observed-contacts.json` du workspace pour réinitialiser
un registre malformé ou non pris en charge ; le trafic accepté le recrée.
Une fraîcheur invalide renvoie `400 invalid_freshness`.

Les clients découvrent la route via la capacité de serve
`workspace_channel_observed_contacts`. La route est en lecture seule et est
enregistrée après l'authentification bearer du démon.

## Compatibilité

Le parsing des webhooks, les requêtes, la résolution des cibles et la
livraison sont identiques à `main`. Cette API expose uniquement les
identifiants observés ; les appelants décident comment les utiliser. Le
registre commence à la version de schéma 1 car le prototype antérieur à
références opaques n'a jamais été publié.

## Stratégie de test

- Les tests du canal de base couvrent la frontière de preflight, la
  normalisation des topics, la déduplication d'Envelope et les échecs de
  persistance non bloquants.
- Les tests du store couvrent la sémantique directe contre groupe, les
  relations groupe/topic, la fraîcheur, les rafraîchissements, les bornes,
  les permissions et les données malformées.
- Les tests de route couvrent les identifiants complets, les réponses
  no-store, la validation de la fraîcheur, la propriété exacte du workspace
  et les échecs assainis.
- Les tests du serveur couvrent l'authentification bearer et l'annonce de la
  capacité.
- Les tests de régression de webhook vérifient qu'aucun comportement ne
  diffère de `main`.
