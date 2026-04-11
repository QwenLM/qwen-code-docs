# DingTalk (Dingtalk)

Ce guide explique comment configurer un canal Qwen Code sur DingTalk (钉钉).

## Prérequis

- Un compte organisation DingTalk
- Une application bot DingTalk disposant d'un AppKey et d'un AppSecret (voir ci-dessous)

## Création d'un bot

1. Accédez au [portail développeur DingTalk](https://open-dev.dingtalk.com)
2. Créez une nouvelle application (ou utilisez-en une existante)
3. Dans l'application, activez la capacité **Robot**
4. Dans les paramètres du Robot, activez le **mode Stream** (机器人协议 → Stream 模式)
5. Notez l'**AppKey** (Client ID) et l'**AppSecret** (Client Secret) depuis la page des identifiants de l'application

### Mode Stream

Le mode Stream de DingTalk utilise une connexion WebSocket sortante : aucune URL publique ni serveur n'est nécessaire. Le bot se connecte aux serveurs de DingTalk, qui poussent les messages via le WebSocket. Il s'agit du modèle de déploiement le plus simple.

## Configuration

Ajoutez le canal à `~/.qwen/settings.json` :

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via DingTalk.",
      "groupPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

Définissez les identifiants comme variables d'environnement :

```bash
export DINGTALK_CLIENT_ID=<your-app-key>
export DINGTALK_CLIENT_SECRET=<your-app-secret>
```

Ou définissez-les dans la section `env` de `settings.json` :

```json
{
  "env": {
    "DINGTALK_CLIENT_ID": "your-app-key",
    "DINGTALK_CLIENT_SECRET": "your-app-secret"
  }
}
```

## Exécution

```bash
# Start only the DingTalk channel
qwen channel start my-dingtalk

# Or start all configured channels together
qwen channel start
```

Ouvrez DingTalk et envoyez un message au bot. Vous devriez voir une réaction emoji 👀 apparaître pendant le traitement par l'agent, suivie de la réponse.

## Conversations de groupe

Les bots DingTalk fonctionnent à la fois en DM et dans les conversations de groupe. Pour activer la prise en charge des groupes :

1. Définissez `groupPolicy` sur `"allowlist"` ou `"open"` dans la configuration de votre canal
2. Ajoutez le bot à un groupe DingTalk
3. @mentionnez le bot dans le groupe pour déclencher une réponse

Par défaut, le bot nécessite une @mention dans les conversations de groupe (`requireMention: true`). Définissez `"requireMention": false` pour un groupe spécifique afin qu'il réponde à tous les messages. Consultez [Conversations de groupe](./overview#group-chats) pour plus de détails.

### Trouver l'ID de conversation d'un groupe

DingTalk utilise `conversationId` pour identifier les groupes. Vous pouvez le trouver dans les logs du service de canal lorsqu'un utilisateur envoie un message dans le groupe : recherchez le champ `conversationId` dans la sortie des logs.

## Images et fichiers

Vous pouvez envoyer des photos et des documents au bot, pas seulement du texte.

**Photos :** Envoyez une image (capture d'écran, diagramme, etc.) et l'agent l'analysera grâce à ses capacités de vision. Cela nécessite un modèle multimodal : ajoutez `"model": "qwen3.5-plus"` (ou un autre modèle compatible vision) à la configuration de votre canal. DingTalk prend en charge l'envoi d'images directement ou dans le cadre de messages en texte enrichi (texte + images mélangés).

**Fichiers :** Envoyez un PDF, un fichier de code ou tout autre document. Le bot le télécharge depuis les serveurs de DingTalk et l'enregistre localement pour que l'agent puisse le lire avec ses outils de fichiers. Les fichiers audio et vidéo sont également pris en charge. Cela fonctionne avec n'importe quel modèle.

## Différences clés avec Telegram

- **Authentification :** AppKey + AppSecret au lieu d'un token de bot statique. Le SDK gère automatiquement le rafraîchissement du token d'accès.
- **Connexion :** Flux WebSocket au lieu du polling : aucune IP publique ni URL de webhook n'est nécessaire.
- **Formatage :** Les réponses utilisent le dialecte Markdown de DingTalk (un sous-ensemble limité). Les tableaux sont automatiquement convertis en texte brut car DingTalk ne les affiche pas. Les messages longs sont découpés en blocs d'environ 3800 caractères.
- **Indicateur de traitement :** Une réaction emoji 👀 est ajoutée au message de l'utilisateur pendant le traitement, puis supprimée une fois la réponse envoyée.
- **Téléchargement de médias :** Processus en deux étapes : un `downloadCode` issu du message est échangé contre une URL de téléchargement temporaire via l'API de DingTalk.
- **Groupes :** DingTalk utilise `isInAtList` pour détecter les @mentions au lieu d'analyser les entités du message.

## Conseils

- **Utilisez des instructions compatibles Markdown DingTalk** — DingTalk prend en charge un sous-ensemble limité de Markdown (titres, gras, liens, blocs de code, mais pas les tableaux). Ajouter des instructions comme "Use DingTalk markdown. Avoid tables." aide l'agent à formater correctement les réponses.
- **Restreignez l'accès** — Dans un contexte organisationnel, `senderPolicy: "open"` peut être acceptable. Pour un contrôle plus strict, utilisez `"allowlist"` ou `"pairing"`. Consultez [Appairage en DM](./overview#dm-pairing) pour plus de détails.
- **Messages référencés** — Citer (répondre à) un message utilisateur inclut le texte cité comme contexte pour l'agent. La citation des réponses du bot n'est pas encore prise en charge.

## Dépannage

### Le bot ne se connecte pas

- Vérifiez que votre AppKey et AppSecret sont corrects
- Vérifiez que les variables d'environnement sont définies avant d'exécuter `qwen channel start`
- Assurez-vous que le **mode Stream** est activé dans les paramètres du bot sur le portail développeur DingTalk
- Vérifiez la sortie du terminal pour détecter d'éventuelles erreurs de connexion

### Le bot ne répond pas dans les groupes

- Vérifiez que `groupPolicy` est défini sur `"allowlist"` ou `"open"` (la valeur par défaut est `"disabled"`)
- Assurez-vous de @mentionner le bot dans le message du groupe
- Vérifiez que le bot a bien été ajouté au groupe

### "No sessionWebhook in message"

Cela signifie que DingTalk n'a pas inclus d'endpoint de réponse dans le callback du message. Cela peut se produire si les permissions du bot sont mal configurées. Vérifiez les paramètres du bot dans le portail développeur.

### "Sorry, something went wrong processing your message"

Cela signifie généralement que l'agent a rencontré une erreur. Consultez la sortie du terminal pour plus de détails.