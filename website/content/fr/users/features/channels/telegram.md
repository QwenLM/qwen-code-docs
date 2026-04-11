# Telegram

Ce guide explique comment configurer un canal Qwen Code sur Telegram.

## Prérequis

- Un compte Telegram
- Un token de bot Telegram (voir ci-dessous)

## Création d'un bot

1. Ouvrez Telegram et recherchez [@BotFather](https://t.me/BotFather)
2. Envoyez `/newbot` et suivez les instructions pour choisir un nom et un nom d'utilisateur
3. BotFather vous fournira un token de bot — conservez-le en sécurité

## Recherche de votre ID utilisateur

Pour utiliser `senderPolicy: "allowlist"` ou `"pairing"`, vous avez besoin de votre ID utilisateur Telegram (un identifiant numérique, et non votre nom d'utilisateur).

La méthode la plus simple pour le trouver :

1. Recherchez [@userinfobot](https://t.me/userinfobot) sur Telegram
2. Envoyez-lui n'importe quel message — il vous répondra avec votre ID utilisateur

## Configuration

Ajoutez le canal à `~/.qwen/settings.json` :

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
export TELEGRAM_BOT_TOKEN=<your-token-from-botfather>
```

Ou ajoutez-le à un fichier `.env` sourcé avant l'exécution.

## Exécution

```bash
# Start only the Telegram channel
qwen channel start my-telegram

# Or start all configured channels together
qwen channel start
```

Ouvrez ensuite votre bot sur Telegram et envoyez un message. Vous devriez voir "Working..." s'afficher immédiatement, suivi de la réponse de l'agent.

## Discussions de groupe

Pour utiliser le bot dans les groupes Telegram :

1. Définissez `groupPolicy` sur `"allowlist"` ou `"open"` dans la configuration de votre canal
2. **Désactivez le mode de confidentialité** dans BotFather : `/mybots` → sélectionnez votre bot → Bot Settings → Group Privacy → Turn Off
3. Ajoutez le bot à un groupe. S'il y était déjà, **supprimez-le et rajoutez-le** (Telegram met en cache les paramètres de confidentialité au moment où le bot rejoint le groupe)
4. Si vous utilisez `groupPolicy: "allowlist"`, ajoutez l'ID de chat du groupe à `groups` dans votre configuration

Par défaut, le bot nécessite une @mention ou une réponse pour interagir dans les groupes. Définissez `"requireMention": false` pour un groupe spécifique afin qu'il réponde à tous les messages (utile pour les groupes dédiés à des tâches). Consultez [Discussions de groupe](./overview#group-chats) pour plus de détails.

## Images et fichiers

Vous pouvez envoyer des photos et des documents au bot, pas seulement du texte.

**Photos :** Envoyez une photo et l'agent l'analysera grâce à ses capacités de vision. Cela nécessite un modèle multimodal — ajoutez `"model": "qwen3.5-plus"` (ou un autre modèle compatible vision) à la configuration de votre canal. Les légendes des photos sont transmises comme texte du message.

**Documents :** Envoyez un PDF, un fichier de code ou tout autre document. Le bot le télécharge et le sauvegarde localement pour que l'agent puisse le lire avec ses outils de fichiers. Cela fonctionne avec n'importe quel modèle. La limite de taille des fichiers sur Telegram est de 20 Mo.

## Conseils

- **Privilégiez des instructions concises** — Telegram impose une limite de 4096 caractères par message. Ajouter des instructions comme "gardez les réponses courtes" aide l'agent à rester dans les limites.
- **Utilisez `sessionScope: "user"`** — Cela donne à chaque utilisateur sa propre conversation. Utilisez `/clear` pour recommencer à zéro.
- **Restreignez l'accès** — Utilisez `senderPolicy: "allowlist"` pour un ensemble fixe d'utilisateurs, ou `"pairing"` pour permettre aux nouveaux utilisateurs de demander l'accès via un code que vous approuvez en CLI. Consultez [Appairage en MP](./overview#dm-pairing) pour plus de détails.

## Formatage des messages

Les réponses Markdown de l'agent sont automatiquement converties en HTML compatible Telegram. Les blocs de code, le gras, l'italique, les liens et les listes sont tous pris en charge.

## Dépannage

### Le bot ne répond pas

- Vérifiez que le token du bot est correct et que la variable d'environnement est définie
- Vérifiez que votre ID utilisateur figure dans `allowedUsers` si vous utilisez `senderPolicy: "allowlist"`, ou que vous avez été approuvé si vous utilisez `"pairing"`
- Consultez la sortie du terminal pour détecter d'éventuelles erreurs

### Le bot ne répond pas dans les groupes

- Vérifiez que `groupPolicy` est défini sur `"allowlist"` ou `"open"` (la valeur par défaut est `"disabled"`)
- Si vous utilisez `"allowlist"`, vérifiez que l'ID de chat du groupe figure dans la configuration `groups`
- Assurez-vous que **Group Privacy est désactivé** dans BotFather — sans cela, le bot ne peut pas voir les messages qui ne sont pas des commandes dans les groupes
- Si vous avez modifié le mode de confidentialité après avoir ajouté le bot à un groupe, **supprimez et rajoutez le bot** au groupe
- Par défaut, le bot nécessite une @mention ou une réponse. Envoyez `@votrenomdebot hello` pour tester

### "Sorry, something went wrong processing your message"

Cela signifie généralement que l'agent a rencontré une erreur. Consultez la sortie du terminal pour plus de détails.

### Le bot met du temps à répondre

L'agent exécute peut-être plusieurs appels d'outils (lecture de fichiers, recherche, etc.). L'indicateur "Working..." s'affiche pendant le traitement. Les tâches complexes peuvent prendre une minute ou plus.