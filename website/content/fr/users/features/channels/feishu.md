# Feishu (Lark)

Ce guide explique comment configurer un canal Qwen Code sur Feishu (飞书) / Lark.

## Prérequis

- Un compte organisation Feishu
- Une application Feishu avec un App ID et un App Secret (voir ci-dessous)

## Création d'une application

1. Accédez à la [Plateforme ouverte Feishu](https://open.feishu.cn)
2. Créez une nouvelle application (ou utilisez-en une existante)

![](https://gw.alicdn.com/imgextra/i4/O1CN01ORb10i1JM0MQfhnsV_!!6000000001013-2-tps-2219-931.png)

3. Dans l'application, activez la capacité **Bot** (添加应用能力 → 机器人)

![](https://gw.alicdn.com/imgextra/i4/O1CN01bClpxu1FZxyH4kNjJ_!!6000000000502-2-tps-2219-931.png)

4. Dans **Abonnements aux événements** (事件与回调), sélectionnez **Connexion longue** (使用长连接接收事件)

![](https://gw.alicdn.com/imgextra/i1/O1CN01uIwzbl1ph8Kwq7hTI_!!6000000005391-2-tps-2219-1166.png)

5. Ajoutez l'événement `im.message.receive_v1` (接收消息)

![](https://gw.alicdn.com/imgextra/i2/O1CN01n7sZmV28s6WX0aDhw_!!6000000007987-2-tps-2219-1090.png)

6. Notez l'**App ID** (Client ID) et l'**App Secret** (Client Secret) depuis la page des identifiants de l'application

![](https://gw.alicdn.com/imgextra/i2/O1CN01ag1yBh1DxfEUb4xmE_!!6000000000283-2-tps-2219-1166.png)

### Permissions requises

Activez les permissions suivantes sous **Permissions & Scopes** (权限管理) :

- `im:message` — Lire et envoyer des messages
- `im:message:send_as_bot` — Envoyer des messages en tant que bot
- `im:resource` — Accéder aux ressources des messages (images, fichiers)

### Publier l'application

Après avoir configuré les permissions et les événements, créez une version et publiez-la. Le bot ne fonctionnera pas tant que l'application n'est pas publiée et approuvée.

![](https://gw.alicdn.com/imgextra/i1/O1CN01GbNRcj1lVuACnkV6M_!!6000000004825-2-tps-2219-1090.png)

## Configuration

Ajoutez le canal dans `~/.qwen/settings.json` :

```json
{
  "channels": {
    "my-feishu": {
      "type": "feishu",
      "clientId": "<your-app-id>",
      "clientSecret": "<your-app-secret>",
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "groupPolicy": "open",
      "collapsible": true,
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### Options de configuration

| Option                 | Description                                                                      |
| ---------------------- | -------------------------------------------------------------------------------- |
| `clientId`             | App ID Feishu                                                                    |
| `clientSecret`         | App Secret Feishu                                                                |
| `collapsible`          | Réduire les longues réponses en sections extensibles (par défaut : `false`)      |
| `collapsibleThreshold` | Seuil de caractères pour la réduction (par défaut : `500`)                       |
| `webhookPort`          | Si défini, utilise le mode webhook HTTP au lieu de WebSocket                     |
| `verificationToken`    | Jeton de vérification pour le mode webhook                                       |
| `encryptKey`           | Clé de chiffrement pour le mode webhook                                          |

## Lancement

```bash
# Démarrer uniquement le canal Feishu
qwen channel start my-feishu

# Ou démarrer tous les canaux configurés ensemble
qwen channel start
```

Ouvrez Feishu et envoyez un message au bot. Vous devriez voir une carte interactive en streaming avec la réponse.

## Modes de connexion

### WebSocket (par défaut)

Le mode WebSocket utilise une connexion longue sortante — aucune URL publique ni serveur n'est nécessaire. Ce mode est recommandé pour la plupart des déploiements.

### Webhook

Si vous avez besoin du mode webhook (par exemple pour des applications partagées), définissez `webhookPort` dans votre configuration :

```json
{
  "channels": {
    "my-feishu": {
      "type": "feishu",
      "webhookPort": 9321,
      "verificationToken": "<from-feishu-console>",
      "encryptKey": "<from-feishu-console>"
    }
  }
}
```

Ensuite, définissez l'URL de requête dans la plateforme ouverte Feishu sur `http://<votre-serveur>:9321`.

## Discussions de groupe

Les bots Feishu fonctionnent à la fois en conversation privée et en groupe. Pour activer le support des groupes :

1. Définissez `groupPolicy` sur `"allowlist"` ou `"open"` dans la configuration du canal
2. Ajoutez le bot à un groupe Feishu
3. Mentionnez @bot dans le groupe pour déclencher une réponse

Par défaut, le bot nécessite une mention @ dans les discussions de groupe (`requireMention: true`). Définissez `"requireMention": false` pour un groupe spécifique afin qu'il réponde à tous les messages.

## Fonctionnalités

### Streaming par cartes interactives

Les réponses sont affichées sous forme de cartes interactives Feishu avec des mises à jour en temps réel. La carte affiche un indicateur « génération en cours » pendant la production de la réponse, et un bouton **Arrêter** pour annuler la génération.

### Contexte de citation/réponse

Lorsque vous répondez à (citation) un message, le contenu cité est automatiquement inclus comme contexte pour l'agent. Cela fonctionne pour :

- Les messages texte et texte enrichi
- Les cartes interactives (réponses précédentes du bot)

### Images et fichiers

Vous pouvez envoyer des photos et des documents au bot :

- **Images :** analysées à l'aide des capacités de vision multimodale
- **Fichiers :** téléchargés et sauvegardés localement pour que l'agent puisse les lire

### Messages simultanés

Plusieurs utilisateurs peuvent envoyer des messages simultanément dans le même groupe. Chaque message obtient sa propre carte et sa propre réponse indépendante — ils n'interfèrent pas entre eux.
## Principales différences avec DingTalk

- **Format de réponse :** Utilise les cartes interactives Feishu (schéma v2) avec rendu natif du Markdown, y compris les tableaux
- **Streaming :** Le contenu de la carte est mis à jour sur place avec des requêtes PATCH limitées (intervalle de 1,5 s)
- **Connexion :** WebSocket via `@larksuiteoapi/node-sdk` — même modèle sortant uniquement, pas d'URL publique nécessaire
- **Indicateur de travail :** Une réaction emoji "OnIt" est ajoutée pendant le traitement
- **Contexte de citation :** Prend en charge la citation des messages textuels et des cartes interactives

## Dépannage

### Le bot ne se connecte pas

- Vérifiez que votre App ID et App Secret sont corrects
- Assurez-vous que **Long Connection** est sélectionné dans les abonnements aux événements
- Vérifiez que l'événement `im.message.receive_v1` est abonné
- Consultez la sortie du terminal pour les erreurs de connexion

### Le bot ne répond pas dans les groupes

- Vérifiez que `groupPolicy` est défini sur `"allowlist"` ou `"open"` (par défaut : `"disabled"`)
- Assurez-vous de mentionner le bot avec @ dans le message de groupe
- Vérifiez que le bot a bien été ajouté au groupe

### La carte reste dans l'état "génération"

- Cela indique généralement que la réponse est terminée mais que la mise à jour finale de la carte a échoué
- Consultez les logs du terminal pour les erreurs d'API (limitation de débit, limites de taille de carte)
- Les très longues réponses contenant de nombreux tableaux peuvent atteindre les limites d'éléments de carte de Feishu

### La citation n'inclut pas le contenu de la carte

- Le bot lit le contenu de la carte via le paramètre d'API `card_msg_content_type=user_card_content`
- Assurez-vous que le bot dispose de la permission `im:message` pour lire les messages
