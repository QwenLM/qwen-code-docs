# Telegram

Ce guide explique comment configurer un canal Qwen Code sur Telegram.

## Prérequis

- Un compte Telegram
- Un token de bot Telegram (voir ci-dessous)

## Créer un bot

1. Ouvrez Telegram et cherchez [@BotFather](https://t.me/BotFather)
2. Envoyez `/newbot` et suivez les instructions pour choisir un nom et un nom d'utilisateur
3. BotFather vous donnera un token de bot — conservez-le en sécurité

## Trouver votre identifiant utilisateur

Pour utiliser `senderPolicy: "allowlist"` ou `"pairing"`, vous avez besoin de votre identifiant utilisateur Telegram (un ID numérique, pas votre nom d'utilisateur).

Le moyen le plus simple de le trouver :

1. Cherchez [@userinfobot](https://t.me/userinfobot) sur Telegram
2. Envoyez-lui n'importe quel message — il répondra avec votre identifiant utilisateur

## Configuration

Ajoutez le canal dans `~/.qwen/settings.json` :

```json
{
  "channels": {
    "my-telegram": {
      "type": "telegram",
      "token": "$TELEGRAM_BOT_TOKEN",
      "senderPolicy": "allowlist",
      "allowedUsers": ["YOUR_USER_ID"],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via Telegram. Keep responses short.",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

Définissez le token du bot comme variable d'environnement :

```bash
export TELEGRAM_BOT_TOKEN=<votre-token-depuis-botfather>
```

Ou ajoutez-le dans un fichier `.env` qui est sourcé avant l'exécution.

## Exécution

```bash
# Démarrer uniquement le canal Telegram
qwen channel start my-telegram

# Ou démarrer tous les canaux configurés ensemble
qwen channel start
```

Ouvrez ensuite votre bot dans Telegram et envoyez un message. Vous devriez voir « Working... » apparaître immédiatement, suivi de la réponse de l'agent.

## Discussions de groupe

Pour utiliser le bot dans des groupes Telegram :

1. Définissez `groupPolicy` sur `"allowlist"` ou `"open"` dans la configuration du canal
2. **Désactivez le mode privé** dans BotFather : `/mybots` → sélectionnez votre bot → Bot Settings → Group Privacy → Désactiver
3. Ajoutez le bot à un groupe. S'il était déjà dans le groupe, **supprimez-le et ajoutez-le à nouveau** (Telegram met en cache les paramètres de confidentialité au moment où le bot a rejoint)
4. Si vous utilisez `groupPolicy: "allowlist"`, ajoutez l'ID du groupe à `groups` dans votre configuration

Par défaut, le bot nécessite une @mention ou une réponse pour répondre dans les groupes. Définissez `"requireMention": false` pour un groupe spécifique afin qu'il réponde à tous les messages (utile pour les groupes de travail dédiés). Voir [Discussions de groupe](./overview#group-chats) pour tous les détails.

## Images et fichiers

Vous pouvez envoyer des photos et des documents au bot, pas seulement du texte.

**Photos :** Envoyez une photo et l'agent l'analysera en utilisant ses capacités de vision. Cela nécessite un modèle multimodal — ajoutez `"model": "qwen3.5-plus"` (ou un autre modèle avec capacités de vision) à la configuration de votre canal. Les légendes des photos sont transmises comme texte du message.

**Documents :** Envoyez un PDF, un fichier de code ou tout autre document. Le bot le télécharge et le sauvegarde localement afin que l'agent puisse le lire avec ses outils de fichiers. Cela fonctionne avec n'importe quel modèle. La limite de taille des fichiers sur Telegram est de 20 Mo.

## Astuces

- **Gardez les instructions concises** — Telegram a une limite de 4096 caractères par message. Ajouter des instructions comme « gardez les réponses courtes » aide l'agent à rester dans les limites.
- **Utilisez `sessionScope: "user"`** — Cela donne à chaque utilisateur sa propre conversation. Utilisez `/clear` pour recommencer.
- **Restreignez l'accès** — Utilisez `senderPolicy: "allowlist"` pour un ensemble fixe d'utilisateurs, ou `"pairing"` pour permettre aux nouveaux utilisateurs de demander l'accès avec un code que vous approuvez via la CLI. Voir [Couplage par MP](./overview#dm-pairing) pour les détails.

## Formatage des messages

Les réponses Markdown de l'agent sont automatiquement converties en HTML compatible Telegram. Les blocs de code, le gras, l'italique, les liens et les listes sont tous pris en charge.

## Dépannage

### Le bot ne répond pas

- Vérifiez que le token du bot est correct et que la variable d'environnement est définie
- Vérifiez que votre identifiant utilisateur se trouve dans `allowedUsers` si vous utilisez `senderPolicy: "allowlist"`, ou que vous avez été approuvé si vous utilisez `"pairing"`
- Vérifiez la sortie du terminal pour les erreurs

### Le bot ne répond pas dans les groupes

- Vérifiez que `groupPolicy` est défini sur `"allowlist"` ou `"open"` (la valeur par défaut est `"disabled"`)
- Si vous utilisez `"allowlist"`, vérifiez que l'ID du groupe est dans la configuration `groups`
- Assurez-vous que **Group Privacy est désactivé** dans BotFather — sans cela, le bot ne peut pas voir les messages non-commandes dans les groupes
- Si vous avez changé le mode de confidentialité après avoir ajouté le bot à un groupe, **supprimez et ré-ajoutez le bot** au groupe
- Par défaut, le bot nécessite une @mention ou une réponse. Envoyez `@nomdevotrebonjour` pour tester

### « Désolé, une erreur s'est produite lors du traitement de votre message »

Cela signifie généralement que l'agent a rencontré une erreur. Vérifiez la sortie du terminal pour plus de détails.

### Le bot met beaucoup de temps à répondre

L'agent peut exécuter plusieurs appels d'outils (lecture de fichiers, recherche, etc.). L'indicateur « Working... » s'affiche pendant le traitement. Les tâches complexes peuvent prendre une minute ou plus.